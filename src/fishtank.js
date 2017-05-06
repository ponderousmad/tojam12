var FISHTANK = (function () {
    "use strict";

        function Tank(viewport, editor) {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = viewport === "safe";
        this.updateInDraw = true;
        this.preventDefaultIO = true;
        this.viewport = viewport ? viewport : "canvas";
        this.program = null;
        this.distance = 0.5;
        this.zoom = 1;
        this.tilt = 0;
        this.TILT_MAX = Math.PI * 0.49;
        this.drawAllCheckbox = document.getElementById("drawAll");
        this.turntableCheckbox = document.getElementById("turntable");
        this.turnRate = document.getElementById("sliderTurnRate");
        this.loadingFile = 0;
        this.loadState = null;

        this.files = ["images/blump.json"];
        this.cans = [];
        this.things = null;
    }

    Tank.prototype.batch = function (blumpData) {
        this.loadState = "batching";

        var blumps = [],
            pixelSize = blumpData.pixelSize || 0.001,
            depthRange = blumpData.depthRange || 0.2;
        for (var d = 0; d < blumpData.blumps.length; ++d) {
            blumps.push(new BLUMP.Blump(blumpData.blumps[d], pixelSize, depthRange));
        }

        var self = this,
            batch = new BLIT.Batch("images/", function() {
                self.constructBlumps(blumps);
            });

        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].loadImage(batch);
        }
        batch.commit();
    };

    Tank.prototype.constructBlumps = function (blumps) {
        this.loadState = "constructing";
        var image = blumps[0].image,
            atlas = blumps[0].constructAtlas(blumps.length);
        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].construct(atlas, false, false);
            blumps[b].image = null;
        }
        this.loadState = null;
        this.loadingFile += 1;

        if (this.loadingFile == this.files.length) {
            this.setupCans(blumps);
        }
    };

    Tank.prototype.setupCans = function (cans) {
        this.cans = cans;
        this.things = [];

        var canCount = 5,
            ySize = 49 * this.cans[0].pixelSize,
            yOffset = -0.5 * canCount * ySize;
        for (var i = 0; i < 5; ++i) {
            var thing = new BLOB.Thing();
            thing.mesh = this.cans[0].mesh;
            thing.move(new R3.V(0, yOffset, 0));
            this.things.push(thing);
            yOffset += ySize;
        }
    };

    Tank.prototype.setupRoom = function (room) {
        this.program = room.programFromElements("vertex-test", "fragment-test", true, false, true);

        room.viewer.near = 0.01;
        room.viewer.far = 10;
        room.gl.enable(room.gl.CULL_FACE);
    };

    Tank.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (this.loadingFile < this.files.length) {
            if (this.loadState === null) {
                this.loadState = "setup";
                var self = this;
                IO.downloadJSON(this.files[this.loadingFile], function (data) {
                    self.batch(data);
                });
            }
        }
        if (this.things) {
            var angleDelta = 0;
            if (pointer.primary) {
                angleDelta = pointer.primary.deltaX * 0.01;
            } else if (!this.turntableCheckbox || this.turntableCheckbox.checked) {
                var turnRate = (this.turnRate ? parseFloat(this.turnRate.value) : null) || 1;
                angleDelta = elapsed * Math.PI * 0.001 * turnRate;
            }
            var animRate = (this.animRate ? parseFloat(this.animRate.value) : null) || 1;

            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                thing.rotate(angleDelta, new R3.V(0, 1, 0));
                thing.update(elapsed * animRate);
            }
        }

        if (pointer.primary) {
            this.tilt += pointer.primary.deltaY * 0.5 * R2.DEG_TO_RAD;
            this.tilt = R2.clamp(this.tilt, -this.TILT_MAX, this.TILT_MAX);
        }

        if (pointer.wheelY) {
            var WHEEL_BASE = 20;
            this.zoom *= (WHEEL_BASE + pointer.wheelY) / WHEEL_BASE;
        }
    };

    Tank.prototype.eyePosition = function () {
        var d = this.distance * this.zoom,
            x = Math.cos(this.tilt),
            y = Math.sin(this.tilt);
        return new R3.V(x * d, y * d, 0);
    };

    Tank.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.things && room.viewer.showOnPrimary()) {
            var eye = this.eyePosition();
            room.viewer.positionView(eye, R3.origin(), new R3.V(0, 1, 0));
            room.setupView(this.program, this.viewport);
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                if (thing.blumps && this.drawAllCheckbox ? this.drawAllCheckbox.checked : false) {
                    var blumps = thing.blumps;
                    thing.blumps = null;
                    for (var b = 0; b < blumps.length; ++b) {
                        thing.mesh = blumps[b].mesh;
                        thing.render(room, this.program, eye);
                    }
                    thing.blumps = blumps;
                } else {
                    thing.render(room, this.program, eye);
                }
            }
        }
    };

    function start() {
        MAIN.start(document.getElementById("canvas3D"), new Tank("safe"));

        MAIN.setupToggleControls();
        if (MAIN.runTestSuites() === 0) {
            console.log("All Tests Passed!");
        }
    }

    return {
        start: start
    };
}());
