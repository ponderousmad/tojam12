var FISHTANK = (function () {
    "use strict";

    var gravitySlider = null,
        velocitySlider = null,
        dragSlider = null,
        BATCH_CAN = 1,
        BATCH_FLIPS = 2;

    function Jellyfish(idleFlip, swimFlip, deathFlip) {
        this.thing = null;

        this.reset();

        this.radialDistance = 0.7;

        this.turnRate = Math.PI * 0.001;
        this.radialVelocityDecay = 0.000001;
        this.gravity = 0.000001;
        this.swimVelocity = 0.001;

        this.idleAnim = idleFlip.setupPlayback(50, true);
        this.swimFlip = swimFlip;
        this.deathFlip = deathFlip;

        this.swimSounds = [];
        this.soundIndex = 0;

        this.deathSound = new BLORT.Noise("sounds/Death01.wav");
        this.pickupSound = new BLORT.Noise("sounds/Pickup01.wav");

        this.thing = new BLOB.Thing();
        this.thing.scaleBy(0.15);
        this.updatePosition();

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

        var mesh = null;
        if (this.deathAnim) {
            mesh = this.deathAnim.mesh();
        } else if (this.swimAnim) {
            mesh = this.swimAnim.mesh();
        } else if (this.alive) {
            this.idleAnim.update(animElapsed);
            mesh = this.idleAnim.mesh();
        }
        this.thing.mesh = mesh;

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

    function Can(blumps, height) {
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
            blump.transformThing(thing);
            thing.move(offset);
            thing.rotate(angleOffset, new R3.V(0, 1, 0));
            blump.placePOIs(thing);

            var transform = thing.getToWorld();

            for (var p = 0; p < blump.pointsOfInterest.length; ++p) {
                var poi = blump.pointsOfInterest[p];
                if (poi.type.slice(0,3) === "obs") {
                    obstacles.push(new Obstacle(transform.transformP(poi.localPoint), poi.type));
                }
            }

            things.push(thing);
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

        this.loadState = 0;

        this.jellyfish = null;
        this.blumps = [];
        this.cans = [];
        this.things = [];
        this.obstacles = [];
        this.urchins = [];
        this.stars = [];

        this.backgroundImages = [];
        this.backgrounds = [];

        this.urchinAnim = null;
        this.starAnim = null;

        this.gameStarted = false;
        this.music = new BLORT.Tune("sounds/MusicLoop");
    }

    Tank.prototype.batchAnimations = function (data) {
        this.jellyfish = new Jellyfish(
            new BLOB.Flip(data.idle, this.textureCache),
            new BLOB.Flip(data.swim, this.textureCache),
            new BLOB.Flip(data.die, this.textureCache)
        );

        this.urchinAnim = new BLOB.Flip(data.urchy, this.textureCache).setupPlayback(50, true);
        this.starAnim = new BLOB.Flip(data.star, this.textureCache).setupPlayback(50, true);
        this.loadState |= BATCH_FLIPS;
        this.updateBatch();
    };

    Tank.prototype.batchCan = function (blumpData) {
        for (var d = 0; d < blumpData.blumps.length; ++d) {
            var blump = new BLUMP.Blump(
                blumpData.blumps[d],
                blumpData.pixelSize || 0.001,
                blumpData.depthRange || 0.2,
                blumpData.depthOffset || 0.1,
                BLIT.ALIGN.Bottom
            );
            this.blumps.push(blump);
        }

        for (var b = 0; b < this.blumps.length; ++b) {
            this.blumps[b].batch(this.batch);
        }

        this.loadState |= BATCH_CAN;
        this.updateBatch();
    };

    Tank.prototype.updateBatch = function () {
        if (this.loadState === (BATCH_CAN | BATCH_FLIPS)) {
            this.batch.commit();
        }
    };

    Tank.prototype.constructBlumps = function () {
        var textures = [],
            blumps = this.blumps;
        for (var b = 0; b < blumps.length; ++b) {
            var found = false,
                blump = blumps[b];
            for (var t = 0; t < textures.length; ++t) {
                if (textures[t] === blump.texture) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                textures.push(blump.texture);
            }
        }
        var image = blumps[0].image,
            atlas = blumps[0].constructAtlas(textures.length);

        for (b = 0; b < blumps.length; ++b) {
            blumps[b].construct(atlas, false, false);
        }
        this.setupCan(blumps);
        this.finalize();
    };

    Tank.prototype.setupCan = function (blumps) {
        var can = new Can(blumps, blumps[0].height() * blumps[0].pixelSize);
        for (var b = 0; b < blumps.length; ++b) {
            blumps[b].simplify();
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

        this.urchinAnim.setup();
        this.starAnim.setup();
        this.jellyfish.idleAnim.setup();
        this.jellyfish.swimFlip.constructMeshes();
        this.jellyfish.deathFlip.constructMeshes();

        for (var o = 0; o < this.obstacles.length; ++o) {
            var obstacle = this.obstacles[o];
            if (obstacle.type === "obsUrchin") {
                var urchin = new BLOB.Thing(),
                    urchinLocation = obstacle.position.copy();
                if (urchinLocation.y < -0.2) {
                    continue;
                }
                urchinLocation.x *= 1.3;
                urchinLocation.z *= 1.3;
                urchin.setPosition(urchinLocation);
                urchin.scaleBy(0.15);
                urchin.setBillboardUp(new R3.V(0, 1, 0));
                this.urchins.push(urchin);
            }
            if (obstacle.type === "obsStar") {
                var star = new BLOB.Thing(),
                    starPos = obstacle.position.copy();
                if (starPos.y < -0.2) {
                    continue;
                }
                starPos.x *= 1.2;
                starPos.z *= 1.2;
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

        var self = this;
        this.batch = new BLIT.Batch("images/", function() {
            self.constructBlumps();
            self.setupBackgrounds();
            self.loadState = null;
        });

        this.backgroundImages.push(this.batch.load("bg.jpg"));
        this.backgroundImages.push(this.batch.load("bg_layer1.png"));
        this.backgroundImages.push(this.batch.load("bg_layer2.png"));

        this.textureCache = room.textureCache(this.batch);

        IO.downloadJSON("images/tunabits/can.json", function (data) {
            self.batchCan(data);
        });

        IO.downloadJSON("images/flips.json", function (data) {
            self.batchAnimations(data);
        });
    };

    Tank.prototype.update = function (now, elapsed, keyboard, pointer, width, height) {
        if (this.loadState !== null) {
            return;
        }

        if (elapsed > 100) {
            elapsed = 100;
        }
        if (!this.music.playing) {
            if (this.music.isLoaded()) {
                this.music.play();
            }
        }

        var swim = false,
            steer = 0,
            halfHeight = height / 2,
            halfWidth = width / 2;

        this.urchinAnim.update(elapsed);
        this.starAnim.update(elapsed);

        if (keyboard.wasKeyPressed(IO.KEYS.Space) ||
            keyboard.wasKeyPressed(IO.KEYS.Up) ||
            keyboard.wasAsciiPressed("W") ||
            (pointer.activated() && pointer.primary.y < halfHeight)
        ) {
            if (this.gameStarted) {
                swim = true;
            }
        }
        if (keyboard.isKeyDown(IO.KEYS.Left) ||
            keyboard.isAsciiDown("A") ||
            (pointer.primary && pointer.primary.y > halfHeight && pointer.primary.x < halfWidth)
        ) {
            steer = 1;
        }
        if (keyboard.isKeyDown(IO.KEYS.Right) ||
            keyboard.isAsciiDown("D") ||
            (pointer.primary && pointer.primary.y > halfHeight && pointer.primary.x > halfWidth)
        ) {
            steer = -1;
        }

        for (var t = 0; t < this.things.length; ++t) {
            var thing = this.things[t];
            thing.update(elapsed);
        }

        this.jellyfish.update(this.gameStarted, elapsed, swim, steer, this.obstacles);
        this.towerRotation = this.jellyfish.positionAngle;
        this.eyeHeight = this.jellyfish.height;
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
        if (this.loadState !== null) {
            return;
        }
        if (room.viewer.showOnPrimary()) {
            var eye = this.eyePosition(),
                drawHeight = 3;
            room.viewer.positionView(eye, new R3.V(0, this.eyeHeight, 0), new R3.V(0, 1, 0));
            room.setupView(this.program, this.viewport);
            room.gl.depthMask(true);
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                if (Math.abs(thing.position.y - eye.y) < drawHeight) {
                    thing.render(room, this.program, eye);
                }
            }
            for (var b = 0; b < this.backgrounds.length; ++b) {
                this.backgrounds[b].render(room, this.program, eye);
            }

            room.gl.depthMask(false);
            var urchinMesh = this.urchinAnim.mesh();
            room.bindMeshGeometry(urchinMesh, this.program);
            room.bindMeshTexture(urchinMesh, this.program);
            for (var u = 0; u < this.urchins.length; ++u) {
                var urchin = this.urchins[u];
                if (Math.abs(urchin.position.y - eye.y) < drawHeight) {
                    room.drawMeshElements(urchinMesh, this.program, urchin.renderTransform(eye));
                }
            }

            var starMesh = this.starAnim.mesh();
            room.bindMeshGeometry(starMesh, this.program);
            room.bindMeshTexture(starMesh, this.program);
            for (var s = 0; s < this.stars.length; ++s) {
                var star = this.stars[s];
                if (!star.collected && Math.abs(star.position.y - eye.y) < drawHeight) {
                    room.drawMeshElements(starMesh, this.program, star.renderTransform(eye));
                }
            }

            // Need to draw billboards last for alpha blending to work.
            this.jellyfish.thing.render(room, this.program, eye);
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
