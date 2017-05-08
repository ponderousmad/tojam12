var FISHTANK = (function () {
    "use strict";

    var urchinImage = null,
        gravitySlider = null,
        velocitySlider = null,
        dragSlider = null;

    function Jellyfish(batch) {
        this.thing = null;

        this.reset();

        this.radialDistance = 0.7;

        this.turnRate = Math.PI * 0.001;
        this.radialVelocityDecay = 0.000001;
        this.gravity = 0.000001;
        this.swimVelocity = 0.001;

        this.idleAnim = new BLIT.Flip(batch, "jelly/idle_", 15, 5).setupPlayback(50, true);
        this.swimFlip = new BLIT.Flip(batch, "jelly/swim_", 15, 5);
        this.deathFlip = new BLIT.Flip(batch, "jelly/die_", 11, 2);

        this.textureCanvas = null;
        this.textureContext = null;

        this.swimSounds = [];
        this.soundIndex = 0;

        this.deathSound = new BLORT.Noise("sounds/Death01.wav");
        this.pickupSound = new BLORT.Noise("sounds/Pickup01.wav");

        for (var step = 1; step <= 3; ++step) {
            var noise = new BLORT.Noise("sounds/Swim0" + step + ".wav");
            this.swimSounds.push(noise);
        }
    }

    Jellyfish.prototype.reset = function (obstacles) {
        this.angle = 0;
        this.height = 0;
        this.positionAngle = 0;
        this.verticalVelocity = 0;
        this.radialVelocity = 0;
        this.swimAnim = null;
        this.deathAnim = null;
        this.alive = true;
        this.sinceDeath = 0;

        if (obstacles) {
            for (var o = 0; o < obstacles.length; ++o) {
                var obs = obstacles[o];
                if (obs.thing) {
                    obs.thing.collected = false;
                }
            }
        }
    };

    Jellyfish.prototype.construct = function () {
        this.textureCanvas = document.createElement('canvas');
        this.textureContext = this.textureCanvas.getContext('2d');
        this.textureCanvas.width = this.textureCanvas.height = 512;

        this.thing = new BLOB.Thing(WGL.makeBillboard(this.textureCanvas, WGL.uvFill()));
        this.thing.scaleBy(0.24);

        this.updatePosition();
        return this.thing;
    };

    Jellyfish.prototype.update = function (started, elapsed, swim, steer, obstacles) {
        var animElapsed = elapsed,
            gravity = this.gravity * parseFloat(gravitySlider.value) / 100,
            velocity = this.swimVelocity * parseFloat(velocitySlider.value) / 100,
            velocityDrag = this.radialVelocityDecay * parseFloat(dragSlider.value) / 100;
        if (!started) {
            elapsed = 0;
        }

        if (!this.alive) {
            swim = false;
            steer = 0;
            this.sinceDeath += elapsed;
        }

        if (this.deathAnim) {
            if (this.deathAnim.update(elapsed)) {
                this.deathAnim = null;
            }
        }
        if (this.swimAnim) {
            if (this.swimAnim.update(elapsed)) {
                this.swimAnim = null;
            } else {
                swim = false;
            }
        }

        if (steer) {
            this.angle += elapsed * steer * this.turnRate;
        }
        if (swim) {
            this.swimSounds[this.soundIndex].play();
            this.soundIndex = (this.soundIndex + 1) % this.swimSounds.length;
            var swimAngle = this.angle + Math.PI / 2;
            this.verticalVelocity += Math.sin(swimAngle) * velocity;
            this.radialVelocity -= Math.cos(swimAngle) * velocity / this.radialDistance;
            this.swimAnim = this.swimFlip.setupPlayback(20, false);
        }

        this.textureContext.clearRect(0, 0, this.textureCanvas.width, this.textureCanvas.height);
        if (this.deathAnim) {
            this.deathAnim.draw(this.textureContext, 256, 256, BLIT.ALIGN.Center, 400, 400);
        } else if (this.swimAnim) {
            this.swimAnim.draw(this.textureContext, 256, 256, BLIT.ALIGN.Center, 240, 420);
        } else if (this.alive) {
            this.idleAnim.update(animElapsed);
            this.idleAnim.draw(this.textureContext, 256, 256, BLIT.ALIGN.Center, 256, 256);
        }
        this.thing.mesh.updatedTexture = true;

        var direction = Math.sign(this.radialVelocity);
        if (direction) {
            this.radialVelocity -= direction * elapsed * velocityDrag;
            if (Math.sign(this.radialVelocity) !== direction) {
                this.radialVelocity = 0;
            }
        }

        this.positionAngle = R2.clampAngle(this.positionAngle + this.radialVelocity * elapsed);

        var collisionSize = 0.2,
            starSizeSq = 0.15 * 0.15,
            collisionSizeSq = collisionSize * collisionSize,
            breaks = 0.005;

        if (!this.alive && !this.deathAnim && this.verticalVelocity > 0) {
            this.verticalVelocity = 0;
        } else if (this.height > 0) {
            this.verticalVelocity -= gravity * elapsed;
        } else {
            this.verticalVelocity -= this.verticalVelocity * breaks * elapsed;
        }

        for (var o = 0; o < obstacles.length; ++o) {
            if (!this.alive) {
                break;
            }
            var obstacle = obstacles[o],
                distanceSq = R3.pointDistanceSq(this.thing.position, obstacle.position);

            if (distanceSq < collisionSizeSq) {
                if (obstacle.type === "obsSlow") {
                    this.radialVelocity -= this.radialVelocity * breaks * elapsed;
                    this.verticalVelocity -= this.verticalVelocity * breaks * elapsed;
                } else if (obstacle.type === "obsStar") {
                    if (distanceSq < starSizeSq && obstacle.thing && !obstacle.thing.collected) {
                        obstacle.thing.collected = true;
                        this.pickupSound.play();
                    }
                } else if (obstacle.type === "obsUrchin") {
                    this.alive = false;
                    this.deathSound.play();
                    this.deathAnim = this.deathFlip.setupPlayback(40, false);
                } else  {
                    var verticalOffset = this.height - obstacle.position.y,
                        obstacleAngle = Math.atan2(obstacle.z, obstacle.x),
                        angleOffset = R2.clampAngle(obstacleAngle - this.positionAngle);
                    if (Math.sign(verticalOffset) != Math.sign(this.verticalVelocity)) {
                        this.verticalVelocity = 0;
                    }
                    if (Math.sin(angleOffset) != Math.sign(this.angleOffset)) {
                        this.radialVelocity = 0;
                    }
                }
            }
        }

        this.height += this.verticalVelocity * elapsed;

        var BOTTOM = this.alive ? -0.2 : 0,
            TOP = 8;
        if (this.height <= BOTTOM && !this.alive) {
            this.reset(obstacles);
        } else if (this.height < BOTTOM) {
            this.height = BOTTOM;
            this.verticalVelocity = 0;
        } else if (this.height > TOP) {
            this.height = TOP;
            this.verticalVelocity = 0;
        }

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
    };

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
        transform.translate(offset);

        for (var o = 0; o < this.obstacles.length; ++o) {
            obstacles.push(this.obstacles[o].place(transform));
        }
        return heightOffset + this.height * 0.95;
    };

    function Tank(viewport, editor) {
        this.clearColor = [97 / 255, 154 / 255, 130 / 255, 1];
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

        this.files = ["images/tunabits/can.json"];
        this.jellyfish = null;
        this.cans = [];
        this.things = [];
        this.obstacles = [];
        this.urchins = [];
        this.stars = [];

        this.backgroundImages = [];
        this.backgrounds = [];

        this.urchinAnim = null;
        this.starAnim = null;

        this.spriteSize = 256;
        this.urchinCanvas = document.createElement('canvas');
        this.urchinContext = this.urchinCanvas.getContext('2d');
        this.urchinCanvas.width = this.urchinCanvas.height = this.spriteSize;

        this.starCanvas = document.createElement('canvas');
        this.starContext = this.starCanvas.getContext('2d');
        this.starCanvas.width = this.starCanvas.height = this.spriteSize;

        this.gameStarted = false;
        this.music = new BLORT.Tune("sounds/MusicLoop");

        this.batchAnimations();
    }

    Tank.prototype.batchAnimations = function () {
        var self = this,
            jellyfish = null,
            batch = new BLIT.Batch("images/", function() {
                jellyfish.construct();
                self.jellyfish = jellyfish;
                self.setupBackgrounds();
            });
        urchinImage = batch.load("urchin.png");
        this.backgroundImages.push(batch.load("bg.jpg"));
        this.backgroundImages.push(batch.load("bg_layer1.png"));
        this.backgroundImages.push(batch.load("bg_layer2.png"));
        jellyfish = new Jellyfish(batch);

        this.urchinAnim = new BLIT.Flip(batch, "urchy_", 12, 2).setupPlayback(50, true);
        this.starAnim = new BLIT.Flip(batch, "star_", 18, 2).setupPlayback(50, true);
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

    function makeBackground(texture, radius, height, bottom, uTile, vTile) {
        var coords = { uMin: 0, vMin: 0, uSize:uTile, vSize: -vTile},
            mesh = new WGL.makeCyclinder(radius, height, 20, coords, true),
            thing = new BLOB.Thing(mesh);
        thing.setPosition(new R3.V(0, bottom, 0));
        mesh.image = texture;
        return thing;
    }

    Tank.prototype.setupBackgrounds = function () {
        this.backgrounds.push(makeBackground(this.backgroundImages[0], 10, 20, -12, 1, 1));
        this.backgrounds.push(makeBackground(this.backgroundImages[2], 9.5, 20, -12, 8, 5));
        this.backgrounds.push(makeBackground(this.backgroundImages[1], 3, 20, -12, 8, 5));
    };

    Tank.prototype.finalize = function () {
        console.log("Load completed!");
        var hOffset = -0.5,
            angles = [58, 30, 270, 180, 90, 30, 270, 58, 180, 90, 30, 270, 58, 180, 90, 30, 270, 58];

        for (var c = 0; c < this.cans.length; ++c) {
            for (var a = 0; a < angles.length; ++a) {
                var angle = angles[a] * R2.DEG_TO_RAD;
                hOffset = this.cans[c].place(hOffset, angle, this.things, this.obstacles);
            }
        }

        for (var o = 0; o < this.obstacles.length; ++o) {
            var obstacle = this.obstacles[o];
            if (obstacle.type === "obsUrchin") {
                var urchin = new BLOB.Thing(WGL.makeBillboard(this.urchinCanvas, WGL.uvFill())),
                    urchinLocation = obstacle.position.copy();
                if (urchinLocation.y < -0.2) {
                    continue;
                }
                urchinLocation.x *= 1.2;
                urchinLocation.z *= 1.2;
                urchin.setPosition(urchinLocation);
                urchin.scaleBy(0.15);
                urchin.setBillboardUp(new R3.V(0, 1, 0));
                this.urchins.push(urchin);
            }
            if (obstacle.type === "obsStar") {
                var star = new BLOB.Thing(WGL.makeBillboard(this.starCanvas, WGL.uvFill())),
                    starPos = obstacle.position.copy();
                if (starPos.y < -0.2) {
                    continue;
                }
                starPos.x *= 1.1;
                starPos.z *= 1.1;
                star.setPosition(starPos);
                star.scaleBy(0.1);
                star.setBillboardUp(new R3.V(0, 1, 0));
                this.stars.push(star);
                star.collected = false;
                obstacle.thing = star;
            }
        }
        this.gameStarted = true;
    };

    Tank.prototype.setupRoom = function (room) {
        this.program = room.programFromElements("vertex-test", "fragment-test", true, false, true);

        room.viewer.near = 0.01;
        room.viewer.far = 15;
        room.gl.enable(room.gl.CULL_FACE);
        room.gl.blendFunc(room.gl.SRC_ALPHA, room.gl.ONE_MINUS_SRC_ALPHA);
        room.gl.enable(room.gl.BLEND);
    };

    Tank.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (elapsed > 100) {
            elapsed = 100;
        }
        if (!this.music.playing) {
            if (this.music.isLoaded()) {
                this.music.play();
            }
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
            this.urchinAnim.update(elapsed);
            this.starAnim.update(elapsed);

            var res = this.spriteSize, halfRes = res / 2;
            this.urchinContext.clearRect(0, 0, res, res);
            this.urchinAnim.draw(this.urchinContext, halfRes,halfRes, BLIT.ALIGN.Center, res, res);
            this.starContext.clearRect(0, 0, res, res);
            this.starAnim.draw(this.starContext, halfRes, halfRes, BLIT.ALIGN.Center, res, res);

            if (keyboard.wasKeyPressed(IO.KEYS.Space) || keyboard.wasKeyPressed(IO.KEYS.Up)) {
                if (this.gameStarted) {
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
            this.jellyfish.update(this.gameStarted, elapsed, swim, steer, this.obstacles);
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
            room.gl.depthMask(true);
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                if (Math.abs(thing.position.y - eye.y) < 1) {
                    thing.render(room, this.program, eye);
                }
            }
            for (var b = 0; b < this.backgrounds.length; ++b) {
                this.backgrounds[b].render(room, this.program, eye);
            }

            room.gl.depthMask(false);
            var texture = null;
            for (var u = 0; u < this.urchins.length; ++u) {
                var urchin = this.urchins[u];
                if (Math.abs(urchin.position.y - eye.y) < 1) {
                    if (texture === null) {
                        texture = room.rebindTexture(urchin.mesh, this.program);
                    }
                    urchin.render(room, this.program, eye, texture);
                }
            }

            texture = null;
            for (var s = 0; s < this.stars.length; ++s) {
                var star = this.stars[s];
                if (!star.collected && Math.abs(star.position.y - eye.y) < 1) {
                    if (texture === null) {
                        texture = room.rebindTexture(star.mesh, this.program);
                    }
                    star.render(room, this.program, eye, texture);
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
        gravitySlider = document.getElementById("gravity");
        velocitySlider = document.getElementById("velocity");
        dragSlider = document.getElementById("drag");
    }

    return {
        start: start
    };
}());
