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

    Jellyfish.prototype.update = function (started, elapsed, swim, steer) {
        var animElapsed = elapsed;
        if (!started) {
            elapsed = 0;
        }
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
            this.idleAnim.update(animElapsed);
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

    function Obstacle(position, type) {
        this.position = position;
        this.type = type;
    }

    Obstacle.prototype.place = function (transform) {
        return new Obstacle(transform.transformP(this.position), this.type);
    }

    function Can(resource, blumps, height) {
        this.resource = resource;
        this.blumps = blumps;
        this.obstacles = [];
        this.height = height;
    }

    Can.prototype.place = function (heightOffset, angleOffset, things, obstacles) {
        var offset = new R3.V(0, heightOffset, 0);
        for (var b = 0; b < this.blumps.length; ++b) {
            var blump = this.blumps[b],
                thing = new BLOB.Thing();
            thing.mesh = blump.mesh;
            thing.move(offset);
            thing.rotate(angleOffset, new R3.V(0, 1, 0));
            things.push(thing);
        }

        var transform = R3.makeRotateY(angleOffset);
        transform.translate(offset)

        for (var o = 0; o < this.obstacles.length; ++o) {
            obstacles.push(this.obstacles[o].place(transform));
        }
        return heightOffset + this.height;
    }

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

        this.files = ["images/can_do/half.json"];
        this.jellyfish = null;
        this.cans = [];
        this.things = [];
        this.obstacles = [];

        this.gameStarted = false;

        this.batchAnimations();
    }

    Tank.prototype.batchAnimations = function () {
        var self = this,
            jellyfish = null,
            batch = new BLIT.Batch("images/", function() {
                jellyfish.construct();
                self.jellyfish = jellyfish;
            });
        jellyfish = new Jellyfish(batch);
        batch.commit();
    };

    Tank.prototype.batchCan = function (resource, blumpData) {
        this.loadState = "batching";

        var blumps = [];
        for (var d = 0; d < blumpData.blumps.length; ++d) {
            var blump = new BLUMP.Blump(
                blumpData.blumps[d],
                blumpData.pixelSize || 0.001,
                blumpData.depthRange || 0.2,
                blumpData.depthOffset || 0.1,
                BLIT.ALIGN.Bottom
            );
            blumps.push(blump);
        }

        var self = this,
            batch = new BLIT.Batch("images/", function() {
                self.constructBlumps(resource, blumps);
            });

        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].batch(batch);
        }
        batch.commit();
    };

    Tank.prototype.constructBlumps = function (resource, blumps) {
        this.loadState = "constructing";
        var image = blumps[0].image,
            atlas = blumps[0].constructAtlas(blumps.length);

        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].construct(atlas, false, false);
        }
        this.setupCan(resource, blumps);

        this.loadState = null;
        this.loadingFile += 1;

        if (this.loadingFile === this.files.length) {
            this.finalize();
        }
    };

    Tank.prototype.setupCan = function (resource, blumps) {
        var can = new Can(resource, blumps, blumps[0].height() * blumps[0].pixelSize);
        for (var b = 0; b < blumps.length; ++b) {
            var blump = blumps[b];
            for (var p = 0; p < blump.pointsOfInterest.length; ++p) {
                var poi = blump.pointsOfInterest[p];
                if (poi.type.slice(0,3) === "obs") {
                    var position = poi.localPoint.copy();
                    can.obstacles.push(new Obstacle(position, poi.type));
                }
            }
            blump.simplify();
        }
        this.cans.push(can);
    };

    Tank.prototype.finalize = function () {
        console.log("Load completed!");
        var hOffset = 0,
            angles = [30, 270, 58, 180, 90];

        for (var c = 0; c < this.cans.length; ++c) {
            for (var a = 0; a < angles.length; ++a) {
                var angle = angles[a] * R2.DEG_TO_RAD;
                hOffset = this.cans[c].place(hOffset, angle, this.things, this.obstacles);
            }
        }
 /*
        for (var o = 0; o < this.obstacles.length; ++o) {
            var thing = new BLOB.Thing(WGL.makeCube(0.1, true));
            thing.setPosition(this.obstacles[o].position);
            this.things.push(thing);
        }
        */
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
        var swim = false,
            steer = 0;
        if (this.loadingFile < this.files.length) {
            if (this.loadState === null) {
                this.loadState = "setup";
                var self = this,
                    resource = this.files[this.loadingFile];
                IO.downloadJSON(resource, function (data) {
                    self.batchCan(resource, data);
                });
            }
        } else {
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

            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                thing.update(elapsed);
            }
        }

        if (this.jellyfish) {
            this.jellyfish.update(this.gameStarted, elapsed, swim, steer);
            this.towerRotation = this.jellyfish.positionAngle;
            this.eyeHeight = this.jellyfish.height;
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
        if (room.viewer.showOnPrimary()) {
            var eye = this.eyePosition();
            room.viewer.positionView(eye, new R3.V(0, this.eyeHeight, 0), new R3.V(0, 1, 0));
            room.setupView(this.program, this.viewport);
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                if (Math.abs(thing.position.y - eye.y) < 1) {
                    thing.render(room, this.program, eye);
                }
            }
            // Need to draw billboards last for alpha blending to work.
            if (this.jellyfish) {
                this.jellyfish.thing.render(room, this.program, eye);
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
