var FISHTANK = (function () {
    "use strict";

    function Jellyfish(batch) {
        this.thing = null;

        this.angle = 0;
        this.height = 0;
        this.positionAngle = 0;
        this.verticalVelocity = 0;
        this.radialVelocity = 0;
        this.swimAnim = null;
        this.radialDistance = 0.7;

        this.turnRate = Math.PI * 0.001;
        this.radialVelocityDecay = 0.000001;
        this.gravity = 0.000001;
        this.swimVelocity = 0.001;

        this.idleAnim = new BLIT.Flip(batch, "jelly/idle_", 15, 5).setupPlayback(50, true);
        this.swimFlip = new BLIT.Flip(batch, "jelly/swim_", 15, 5);

        this.textureCanvas = null;
        this.textureContext = null;
    }

    Jellyfish.prototype.construct = function () {
        this.textureCanvas = document.createElement('canvas');
        this.textureContext = this.textureCanvas.getContext('2d');
        this.textureCanvas.width = this.textureCanvas.height = 512;
        var coords = { uMin: 0, vMin: 0, uSize: 1, vSize: 1 }

        this.thing = new BLOB.Thing(WGL.makeBillboard(this.textureCanvas, coords));
        this.thing.scaleBy(0.12);

        this.updatePosition();
        return this.thing
    }

    Jellyfish.prototype.update = function (elapsed, swim, steer) {
        if (steer) {
            this.angle += elapsed * steer * this.turnRate;
        }
        if (this.swimAnim) {
            if (this.swimAnim.update(elapsed)) {
                this.swimAnim = null;
            }
        } else if (swim) {
            var swimAngle = this.angle + Math.PI / 2;
            this.verticalVelocity += Math.sin(swimAngle) * this.swimVelocity;
            this.radialVelocity -= Math.cos(swimAngle) * this.swimVelocity / this.radialDistance;
            this.swimAnim = this.swimFlip.setupPlayback(20, false);
        }
        
        this.textureContext.clearRect(0, 0, this.textureCanvas.width, this.textureCanvas.height);
        if (this.swimAnim) {
            this.swimAnim.draw(this.textureContext, 0, 0, BLIT.ALIGN.TopLeft);
        } else {
            this.idleAnim.update(elapsed);
            this.idleAnim.draw(this.textureContext, 0, 0, BLIT.ALIGN.TopLeft);
        }
        this.thing.mesh.updatedTexture = true;

        var direction = Math.sign(this.radialVelocity);
        if (direction) {
            this.radialVelocity -= direction * elapsed * this.radialVelocityDecay;
            if (Math.sign(this.radialVelocity) !== direction) {
                this.radialVelocity = 0;
            }
        }

        this.positionAngle += this.radialVelocity * elapsed;

        this.verticalVelocity -= this.gravity * elapsed;
        this.height += this.verticalVelocity * elapsed;

        this.updatePosition();
    };

    Jellyfish.prototype.updatePosition = function () {
        var x = Math.cos(this.positionAngle),
            z = Math.sin(this.positionAngle);
        this.thing.setPosition(new R3.V(x * this.radialDistance, this.height, z * this.radialDistance));

        var qTilt = R3.angleAxisQ(this.angle, new R3.V(1, 0, 0)),
            qTurn = R3.angleAxisQ(-this.positionAngle, new R3.V(0, 1, 0));
        qTurn.times(qTilt);
        this.thing.setBillboardUp(R3.makeRotateQ(qTurn).transformV(new R3.V(0, 1, 0)));
    };

    function Tank(viewport, editor) {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = viewport === "safe";
        this.updateInDraw = true;
        this.preventDefaultIO = true;
        this.viewport = viewport ? viewport : "canvas";
        this.program = null;
        this.distance = 1.5;
        this.zoom = 1;
        this.tilt = 0;
        this.towerRotation = 0;
        this.TILT_MAX = Math.PI * 0.49;
        this.eyeHeight = 0;

        this.loadingFile = 0;
        this.loadState = null;

        this.files = ["images/can_do/test.json"];
        this.jellyfish = null;
        this.cans = [];
        this.things = null;
        this.canHeight = null;

        this.gameStarted = false;
    }

    Tank.prototype.batch = function (blumpData) {
        this.loadState = "batching";

        var blumps = [],
            pixelSize = blumpData.pixelSize || 0.001,
            depthRange = blumpData.depthRange || 0.2,
            depthOffset = blumpData.depthOffset || 0.1;
        for (var d = 0; d < blumpData.blumps.length; ++d) {
            blumps.push(new BLUMP.Blump(blumpData.blumps[d], pixelSize, depthRange,  depthOffset));
        }

        var self = this,
            batch = new BLIT.Batch("images/", function() {
                self.constructBlumps(blumps);
            });

        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].loadImage(batch);
        }
        this.jellyfish = new Jellyfish(batch);
        batch.commit();
    };

    Tank.prototype.constructBlumps = function (blumps) {
        this.loadState = "constructing";
        var image = blumps[0].image,
            atlas = blumps[0].constructAtlas(blumps.length);
        if (this.canHeight === null) {
            this.canHeight = image.height;
        }
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
        this.cans = []
        this.things = [];

        var canCount = cans.length,
            ySize = this.canHeight * cans[0].pixelSize,
            yOffset = -0.5 * canCount * ySize;
        for (var c = 0; c < canCount; ++c) {
            var thing = new BLOB.Thing();
            thing.mesh = cans[c].mesh;
            thing.move(new R3.V(0, 0, 0));
            this.things.push(thing);
            this.cans.push(thing);
            yOffset += ySize;
        }

        this.things.push(this.jellyfish.construct());
    };

    Tank.prototype.setupRoom = function (room) {
        this.program = room.programFromElements("vertex-test", "fragment-test", true, false, true);

        room.viewer.near = 0.01;
        room.viewer.far = 10;
        room.gl.enable(room.gl.CULL_FACE);
        room.gl.blendFunc(room.gl.SRC_ALPHA, room.gl.ONE_MINUS_SRC_ALPHA);
        room.gl.enable(room.gl.BLEND);
    };

    Tank.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (elapsed > 100) {
            elapsed = 100;
        }
        if (this.loadingFile < this.files.length) {
            if (this.loadState === null) {
                this.loadState = "setup";
                var self = this;
                IO.downloadJSON(this.files[this.loadingFile], function (data) {
                    self.batch(data);
                });
            }
        } else {
            var swim = false,
                steer = 0;

            if (keyboard.wasKeyPressed(IO.KEYS.Space)) {
                if (!this.gameStarted) {
                    this.gameStarted = true;
                } else {
                    swim = true;
                }
            }
            if (keyboard.isKeyDown(IO.KEYS.Left) || keyboard.isAsciiDown("A")) {
                steer = 1;
            }
            if (keyboard.isKeyDown(IO.KEYS.Right) || keyboard.isAsciiDown("D")) {
                steer = -1;
            }

            this.jellyfish.update(this.gameStarted ? elapsed : 0, swim, steer);
            this.towerRotation = this.jellyfish.positionAngle;
            this.eyeHeight = this.jellyfish.height;
        }

        if (this.things) {
            var animRate = (this.animRate ? parseFloat(this.animRate.value) : null) || 1;
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                thing.update(elapsed * animRate);
            }
        }

        if (pointer.wheelY) {
            var WHEEL_BASE = 20;
            this.zoom *= (WHEEL_BASE + pointer.wheelY) / WHEEL_BASE;
        }
    };

    Tank.prototype.eyePosition = function () {
        var d = this.distance * this.zoom,
            hOffset = Math.cos(this.tilt),
            x = Math.cos(this.towerRotation) * hOffset,
            y = Math.sin(this.tilt),
            z = Math.sin(this.towerRotation) * hOffset;

        return new R3.V(x * d, y * d + this.eyeHeight, z * d);
    };

    Tank.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.things && room.viewer.showOnPrimary()) {
            var eye = this.eyePosition();
            room.viewer.positionView(eye, new R3.V(0, this.eyeHeight, 0), new R3.V(0, 1, 0));
            room.setupView(this.program, this.viewport);
            for (var t = 0; t < this.things.length; ++t) {
                this.things[t].render(room, this.program, eye);
            }
        }
    };

    function start() {
        if (MAIN.runTestSuites() === 0) {
            console.log("All Tests Passed!");
        }
        MAIN.start(document.getElementById("canvas3D"), new Tank("safe"));
    }

    return {
        start: start
    };
}());
