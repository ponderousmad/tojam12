var FISHTANK = (function () {
    "use strict";

    var gravityValue = 100,
        velocityValue = 100,
        dragValue = 100,
        BATCH_CAN = 1,
        BATCH_FLIPS = 2,
        TITLE_INSTRUCTIONS = 2,
        TITLE_FADE_START = 1,
        WIN_TIME = 5,
        WIN_CAN_SKIP = 4,
        WIN_FADE_START = 1,
        STAR_OFFSET = 0.72,
        URCHIN_OFFSET = 0.78;

    function Jellyfish(idleFlip, swimFlip, deathFlip) {
        this.thing = null;

        this.radialDistance = 0.71;

        this.turnRate = Math.PI * 0.001;
        this.velocityDrag = 10;
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
        this.thing.scaleBy(0.18);

        this.reset();

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
        this.updatePosition();

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
            gravity = this.gravity * parseFloat(gravityValue) / 100,
            velocity = this.swimVelocity * parseFloat(velocityValue) / 100,
            velocityDrag = this.velocityDrag * parseFloat(dragValue) / 100;
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

        var vVel = this.verticalVelocity,
            hVel = this.radialVelocity * this.radialDistance,
            totalVel = Math.sqrt(vVel * vVel + hVel * hVel),
            drag = totalVel * velocityDrag * elapsed;

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
            this.radialVelocity -= this.radialVelocity * drag * this.radialDistance;
            if (Math.sign(this.radialVelocity) !== direction) {
                this.radialVelocity = 0;
            }
        }

        var collisionSize = 0.22,
            collisionSizeSmallSq = 0.18 * 0.18,
            urchinSizeSq = 0.16 * 0.16,
            starSizeSq = 0.13 * 0.13,
            collisionSizeSq = collisionSize * collisionSize,
            breaks = 0.005,
            collectedStar = null;

        if (!this.alive && !this.deathAnim && this.verticalVelocity > 0) {
            this.verticalVelocity = 0;
        } else if (this.height > 0) {
            var slowBy = this.verticalVelocity * drag;
            this.verticalVelocity -= gravity * elapsed;
            if (Math.abs(slowBy) > Math.abs(this.verticalVelocity)) {
                this.verticalVelocity = 0;
            } else {
                this.verticalVelocity -= slowBy;
            }
        } else {
            this.verticalVelocity -= this.verticalVelocity * breaks * elapsed;
        }

        for (var o = 0; o < obstacles.length; ++o) {
            if (!this.alive || !started) {
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
                        collectedStar = obstacle;
                        obstacle.thing.collected = true;
                        this.pickupSound.play();
                    }
                } else if (obstacle.type === "obsUrchin") {
                    if (distanceSq < urchinSizeSq) {
                        this.alive = false;
                        this.deathSound.play();
                        this.deathAnim = this.deathFlip.setupPlayback(40, false);
                    }
                } else if (obstacle.type === "obstacle" || distanceSq < collisionSizeSmallSq) {
                    var verticalOffset = this.height - obstacle.position.y,
                        obstacleAngle = Math.atan2(obstacle.position.z, obstacle.position.x),
                        angleOffset = R2.clampAngle(obstacleAngle - this.positionAngle);
                    if (Math.sign(verticalOffset) != Math.sign(this.verticalVelocity)) {
                        this.verticalVelocity = 0;
                    }
                    if (Math.sign(angleOffset) == Math.sign(this.radialVelocity)) {
                        this.radialVelocity = -this.radialVelocity * 0.25;
                    }
                }
            }
        }

        var BOTTOM = -0.1,
            TOP = 7.9;
        if (this.height < BOTTOM) {
            this.height = BOTTOM;
            this.verticalVelocity = 0;
        } else if (this.height > TOP) {
            this.height = TOP;
            if (this.verticalVelocity > 0) {
                this.verticalVelocity = 0;
            }
        }

        this.height += this.verticalVelocity * elapsed;
        this.positionAngle = R2.clampAngle(this.positionAngle + this.radialVelocity * elapsed);

        this.updatePosition();

        return collectedStar;
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

    Jellyfish.prototype.isDead = function() {
        return !this.alive && this.deathAnim === null;
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

    function Tank(viewport, scoreCanvas) {
        this.clearColor = [0,0,0,1];
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
        this.sandBlump = null;
        this.waterTexture = null;

        this.backgroundImages = [];
        this.backgrounds = [];

        this.scoreCanvas = scoreCanvas;
        this.scoreContext = scoreCanvas.getContext('2d');
        this.digits = null;
        this.scoreBack = null;

        this.urchinAnim = null;
        this.starAnim = null;
        this.dyingStar = null;

        this.tint = 1.0;
        this.gameStarted = false;
        this.editing = false;
        this.titleState = null;
        this.winState = null;
        this.music = new BLORT.Tune("sounds/MusicLoop");
        this.winSound = new BLORT.Noise("sounds/Win01.wav");
        this.winCount = 17;

        this.activeObstacle = null;

        this.setupControls();
    }

    Tank.prototype.setupControls = function () {
        function setupSlider(idBase, handleChange) {
            var slider = document.getElementById("slider" + idBase),
                value = document.getElementById("value" + idBase);
            if (slider) {
                slider.addEventListener("input", function (e) {
                    if (value) {
                        value.value = slider.value;
                    }
                    handleChange(parseFloat(slider.value));
                });
            }
            if (value) {
                value.addEventListener("change", function (e) {
                    if (!isNaN(value.value)) {
                        if (slider) {
                            slider.value = value.value;
                        }
                        handleChange(parseFloat(value.value));
                    }
                });
            }

            return function(initialValue) {
                if (value) { value.value = initialValue; }
                if (slider) { slider.value = initialValue; }
            };
        }

        this.initGravity = setupSlider("Gravity", function (value) { gravityValue = value; });
        this.initVelocity = setupSlider("Velocity", function (value) { velocityValue = value; });
        this.initDrag = setupSlider("Drag", function (value) { dragValue = value; });

        this.initParameters();

        var self = this;
        this.selectObstacle = document.getElementById("selectObstacle");
        this.initObstacleAngle = setupSlider("Angle", function (value) { self.setObstacleAngle(value); });
        this.initObstacleHeight = setupSlider("Height", function (value) { self.setObstacleHeight(value); });

        if (this.selectObstacle) {
            this.selectObstacle.addEventListener("change", function (e) {
                self.activeObstacle = self.obstacles[parseInt(self.selectObstacle.value)];
                self.connectObstacleControls();
            }, true);
        }

        var clipboardButton = document.getElementById("buttonClipboard");
        if (clipboardButton) {
            this.editArea = document.getElementById("textData");
            if (this.editArea) {
                this.editArea.addEventListener("paste", function (event) {
                    setTimeout(function () {
                        var textData = self.editArea.value;
                        if (textData[0] === "{") {
                            self.load(JSON.parse(textData));
                            self.setupObstacles();
                        }
                    });
                }, false);
            }
            clipboardButton.addEventListener("click", function(e) {
                self.editArea.value = self.save();
                self.editArea.select();
                self.editArea.focus();
                document.execCommand("copy");
            }, true);
        }

        this.overlay = document.getElementById("overlay");
        this.overlay.addEventListener("click", function (e) {
            self.clickOverlay();
        }, true);

        this.winOverlay = document.getElementById("win");
        this.winOverlay.addEventListener("click", function (e) {
            self.clickWin();
        }, true);

        var editToggle = document.getElementById("buttonEdit");
        if (editToggle) {
            editToggle.addEventListener("click", function (e) {
                self.editing = !self.editing;
            }, true);
        }
    };

    Tank.prototype.initParameters = function () {
        this.initGravity(gravityValue);
        this.initDrag(dragValue);
        this.initVelocity(velocityValue);
    };

    Tank.prototype.clickOverlay = function () {
        if (this.titleState === TITLE_INSTRUCTIONS) {
            this.titleState = TITLE_FADE_START;
        }
    };

    Tank.prototype.clickWin = function () {
        if (!isNaN(this.winState) && this.winState > WIN_FADE_START && this.winState < WIN_CAN_SKIP) {
            this.winState = WIN_FADE_START;
        }
    };

    Tank.prototype.connectSelectObstacles = function () {
        if (this.selectObstacle) {
            this.activeObstacle = null;
            this.selectObstacle.innerHTML = "";

            var starCount = 0,
                urchinCount = 0,
                first = null,
                self =  this,
                addObstacles = function (type) {
                    for (var o = 0; o < self.obstacles.length; ++o) {
                        var obstacle = self.obstacles[o],
                            name = null;
                        if (obstacle.type !== type) {
                            continue;
                        }
                        if (obstacle.type === "obsStar") {
                            ++starCount;
                            name = "Star " + starCount;
                            if (self.activeObstacle === null) {
                                self.activeObstacle = obstacle;
                            }
                        } else if (obstacle.type == "obsUrchin") {
                            ++urchinCount;
                            name = "Urchin " + urchinCount;
                        }
                        if (name) {
                            self.selectObstacle.appendChild(new Option(name, o));
                        }
                    }
                };

            addObstacles("obsStar");
            addObstacles("obsUrchin");
            self.connectObstacleControls();
        }
    };

    Tank.prototype.setObstacleAngle = function (value) {
        if (this.activeObstacle) {
            var angle = value * R2.DEG_TO_RAD,
                offset = this.activeObstacle.type == "obsStar" ? STAR_OFFSET : URCHIN_OFFSET;
            this.activeObstacle.position.x = Math.cos(angle) * offset;
            this.activeObstacle.position.z = Math.sin(angle) * offset;
            this.activeObstacle.thing.setPosition(this.activeObstacle.position);
        }
    };

    Tank.prototype.setObstacleHeight = function (value) {
        if (this.activeObstacle) {
            this.activeObstacle.position.y = value;
            this.activeObstacle.thing.setPosition(this.activeObstacle.position);
        }
    };

    Tank.prototype.connectObstacleControls = function () {
        if (this.activeObstacle) {
            var angle = R2.clampAngle(Math.atan2(this.activeObstacle.position.z, this.activeObstacle.position.x));
            this.initObstacleHeight(this.activeObstacle.position.y);
            this.initObstacleAngle(angle * R2.RAD_TO_DEG);
        }
    };

    Tank.prototype.save = function () {
        var data = {
            gravity: gravityValue,
            velocity: velocityValue,
            drag: dragValue,
            stars: [],
            urchins: []
        };

        for (var o = 0; o < this.obstacles.length; ++o) {
            var obstacle = this.obstacles[o],
                pos = obstacle.thing ? obstacle.thing.position : obstacle.position,
                angle = R2.clampAngle(Math.atan2(pos.z, pos.x)),
                entry = {
                    angle: (angle * R2.RAD_TO_DEG).toFixed(2),
                    height: pos.y.toFixed(3)
                };
            if (obstacle.type === "obsStar") {
                data.stars.push(entry);
            }
            if (obstacle.type === "obsUrchin") {
                data.urchins.push(entry);
            }
        }

        return JSON.stringify(data, null, 4);
    };

    function calculatePosition(data, offset) {
        var height = parseFloat(data.height) || 0,
            angle = (parseFloat(data.angle) || 0) * R2.DEG_TO_RAD;
        return new R3.V(Math.cos(angle) * offset, height, Math.sin(angle) * offset);
    }

    Tank.prototype.load = function (data) {
        gravityValue = data.gravity || gravityValue;
        velocityValue = data.velocity || velocityValue;
        dragValue = data.drag || dragValue;
        this.initParameters();

        this.stars = [];
        this.urchins = [];

        var colliders = [];
        for (var o = 0; o < this.obstacles.length; ++o) {
            var obstacle = this.obstacles[o];
            if (obstacle.type === "obsStar" || obstacle.type === "obsUrchin") {
                continue;
            }
            colliders.push(obstacle);
        }
        this.obstacles = colliders;

        for (var s = 0; s < data.stars.length; ++s) {
            var star = data.stars[s];
            this.obstacles.push(new Obstacle(calculatePosition(star, STAR_OFFSET), "obsStar"));
        }

        for (var u = 0; u < data.urchins.length; ++u) {
            var urchin = data.urchins[u];
            this.obstacles.push(new Obstacle(calculatePosition(urchin, URCHIN_OFFSET), "obsUrchin"));
        }
    };

    Tank.prototype.batchAnimations = function (data) {
        this.jellyfish = new Jellyfish(
            new BLOB.Flip(data.idle, this.textureCache),
            new BLOB.Flip(data.swim, this.textureCache),
            new BLOB.Flip(data.die, this.textureCache)
        );

        this.urchinAnim = new BLOB.Flip(data.urchy, this.textureCache).setupPlayback(50, true);
        this.starAnim = new BLOB.Flip(data.star, this.textureCache).setupPlayback(50, true);
        this.starDieFlip = new BLOB.Flip(data.starDie, this.textureCache);
        this.loadState |= BATCH_FLIPS;
        this.updateBatch();
    };

    Tank.prototype.batchCan = function (worldData) {
        for (var d = 0; d < worldData.blumps.length; ++d) {
            var blump = new BLUMP.Blump(
                worldData.blumps[d],
                worldData.pixelSize || 0.001,
                worldData.depthRange || 0.2,
                worldData.depthOffset || 0.1,
                BLIT.ALIGN.Bottom
            );
            this.blumps.push(blump);
        }

        for (var b = 0; b < this.blumps.length; ++b) {
            this.blumps[b].batch(this.batch);
        }

        this.sandBlump = new BLUMP.Blump({
            resource: "bottom.png",
            texture: "bottom.jpg",
            pixelSize: 0.04,
            depthRange: 0.4,
            xEdgeMode: 0,
            yEdgeMode: 0,
            angle: 0,
        });
        this.sandBlump.batch(this.batch);

        this.waterTexture = this.textureCache.cache("water.jpg");
        this.digits = this.batch.load("digits.png");
        this.scoreBack = this.batch.load("scoreBack.png");

        this.load(worldData);

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
        var atlas = blumps[0].constructAtlas(textures.length);

        for (b = 0; b < blumps.length; ++b) {
            blumps[b].construct(atlas, false, false);
        }

        atlas = this.sandBlump.constructAtlas(1);
        this.sandBlump.construct(atlas, false, false);

        this.setupCan(blumps);
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
        var hOffset = 0,
            angles = [30, 270, 180, 90, 30, 270, 58, 180, 90, 30, 270, 58, 180, 90, 30, 270, 58],
            sandThing = new BLOB.Thing(this.sandBlump.mesh),
            waterThing = new BLOB.Thing(WGL.makeBillboard(WGL.uvFill()));
        this.things.push(sandThing);
        sandThing.rotate(-Math.PI / 2, new R3.V(1, 0, 0));
        sandThing.move(new R3.V(0, -0.45, 0));
        this.things.push(waterThing);
        waterThing.mesh.texture = this.waterTexture.texture;
        waterThing.rotate(-Math.PI / 2, new R3.V(1, 0, 0));
        waterThing.move(new R3.V(0, 8, 0));
        waterThing.scaleBy(10);

        for (var c = 0; c < this.cans.length; ++c) {
            for (var a = 0; a < angles.length; ++a) {
                var angle = angles[a] * R2.DEG_TO_RAD;
               hOffset = this.cans[c].place(hOffset, angle, this.things, this.obstacles);
            }
        }

        this.urchinAnim.setup();
        this.starAnim.setup();
        this.starDieFlip.constructMeshes();
        this.jellyfish.idleAnim.setup();
        this.jellyfish.swimFlip.constructMeshes();
        this.jellyfish.deathFlip.constructMeshes();

        this.setupObstacles();

        this.loadState = null;
    };

    Tank.prototype.setupObstacles = function () {
                for (var o = 0; o < this.obstacles.length; ++o) {
            var obstacle = this.obstacles[o];
            if (obstacle.type === "obsUrchin") {
                var urchin = new BLOB.Thing();
                urchin.setPosition(obstacle.position);
                urchin.scaleBy(0.15);
                urchin.setBillboardUp(new R3.V(0, 1, 0));
                this.urchins.push(urchin);
                obstacle.thing = urchin;
            }
            if (obstacle.type === "obsStar") {
                var star = new BLOB.Thing();
                star.setPosition(obstacle.position);
                star.scaleBy(0.1);
                star.setBillboardUp(new R3.V(0, 1, 0));
                this.stars.push(star);
                star.collected = false;
                obstacle.thing = star;
            }
        }
        this.connectSelectObstacles();
    };

    Tank.prototype.setupRoom = function (room) {
        this.program = room.programFromElements("vertex-test", "fragment-test", true, false, true);

        room.viewer.near = 0.05;
        room.viewer.far = 15;
        room.gl.enable(room.gl.CULL_FACE);
        room.gl.blendFunc(room.gl.SRC_ALPHA, room.gl.ONE_MINUS_SRC_ALPHA);
        room.gl.enable(room.gl.BLEND);

        var self = this;
        this.batch = new BLIT.Batch("images/", function() {
            self.constructBlumps();
            self.setupBackgrounds();
            self.finalize();
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

    Tank.prototype.drawScore = function (value, left, top, width, height, srcWidth, srcHeight, tint) {
        var tens = Math.floor(value / 10),
            ones = value % 10;
        if (tens > 0) {
            BLIT.tinted(
                this.scoreContext, this.digits,
                left, top, height, width,
                tint, false,
                srcWidth * tens, 0, srcWidth, srcHeight
            );
            left += width;
        } else {
            left += width * 0.4;
        }
        BLIT.tinted(
            this.scoreContext, this.digits,
            left, top, height, width,
            tint, false,
            srcWidth * ones, 0, srcWidth, srcHeight
        );
    };

    Tank.prototype.updateScore = function (width, height, collected) {
        width = Math.round(Math.max(width * 0.15, 150));
        height = Math.round(this.scoreCanvas.width * this.scoreBack.height / this.scoreBack.width);

        var srcWidth = this.digits.width / 10,
            srcHeight = this.digits.height,
            digitHeight = height * 0.5,
            digitWidth = digitHeight * srcWidth / srcHeight;

        var scoreData = JSON.stringify({w: width, h: height, stars: this.winCount, collected: collected});
        if (this.scoreData === scoreData) {
            return;
        }
        this.scoreData = scoreData;

        this.scoreCanvas.width = width;
        this.scoreCanvas.height = height;
        this.scoreContext.clearRect(0, 0, width, height);
        this.scoreContext.drawImage(this.scoreBack, 0, 0, width, height);

        this.drawScore(collected, width * 0.05, height * 0.15, digitWidth, digitHeight, srcWidth, srcHeight, [1,1,1]);
        digitHeight *= 0.8;
        digitWidth *= 0.8;
        this.drawScore(this.winCount, width * 0.55, height * 0.50, digitWidth, digitHeight, srcWidth, srcHeight, [1,0.5,0.1]);
    };

    Tank.prototype.update = function (now, elapsed, keyboard, pointer, width, height) {
        if (elapsed > 100) {
            elapsed = 100;
        }

        if (this.loadState !== null) {
            return;
        }

        var swim = false,
            steer = 0,
            halfHeight = height / 2,
            halfWidth = width / 2,
            isSwimTouch = false,
            isLeftTouch = false,
            isRightTouch = false,
            fadeRate = 0.001;

        if (halfWidth < halfHeight) {
            halfHeight = height - halfWidth;
        }

        if (this.winState !== null) {
            this.winState -= elapsed * fadeRate;
            if (this.winState > WIN_FADE_START) {
                if (this.winState < WIN_CAN_SKIP && (keyboard.keysDown() > 0 || pointer.activated())) {
                    this.winState = WIN_FADE_START;
                }
            } else if (this.winState <= 0) {
                this.winState = null;
                this.winOverlay.classList.add("hidden");
                this.winOverlay.style.opacity = 1;
            } else {
                this.winOverlay.style.opacity = this.winState;
                this.tint = 1 - this.winState;
                this.jellyfish.alive = false;
            }
        } else if (!this.gameStarted) {
            if (this.titleState === null) {
                this.titleState = TITLE_INSTRUCTIONS;
                var loading = document.getElementById("loading"),
                    instructions = document.getElementById("instructions");
                loading.classList.add("hidden");
                instructions.classList.remove("hidden");
            } else if (this.titleState === TITLE_INSTRUCTIONS) {
                if (keyboard.keysDown() > 0 || pointer.activated()) {
                    this.titleState = TITLE_FADE_START;
                }
            } else {
                this.titleState -= elapsed * fadeRate;
                if (this.titleState <= 0) {
                    this.titleState = 0;
                    this.gameStarted = true;
                    this.overlay.classList.add("hidden");
                } else {
                    this.overlay.style.opacity = this.titleState;
                }
            }
            if (this.tint > 0.5) {
                this.tint -= elapsed * fadeRate;
            }
        } else if (this.editing) {
            var heightScale = 0.001,
                angleScale = 0.001;
            if (keyboard.isKeyDown(IO.KEYS.Up)) {
                this.jellyfish.height += elapsed * heightScale;
            }
            if (keyboard.isKeyDown(IO.KEYS.Down)) {
                this.jellyfish.height -= elapsed * heightScale;
            }
            if (keyboard.isKeyDown(IO.KEYS.Left)) {
                this.jellyfish.positionAngle += elapsed * angleScale;
            }
            if (keyboard.isKeyDown(IO.KEYS.Right)) {
                this.jellyfish.positionAngle -= elapsed * angleScale;
            }
        } else {
            if (!this.music.playing && this.music.isLoaded()) {
                this.music.play();
            }
            if (this.jellyfish.isDead()) {
                this.tint += elapsed * fadeRate;
                if (this.tint >= 1) {
                    this.tint = 1;
                    this.jellyfish.reset(this.obstacles);
                }
            } else if (this.tint > 0) {
                this.tint -= elapsed * fadeRate;
            } else {
                this.tint = 0.0;
            }

            pointer.touch.filterTouches(function (id, x, y, isStart) {
                if (y < halfHeight) {
                    if (isStart) {
                        isSwimTouch = true;
                    }
                } else {
                    if (x < halfWidth) {
                        isLeftTouch = true;
                    } else {
                        isRightTouch = true;
                    }
                }
            });

            if (keyboard.wasKeyPressed(IO.KEYS.Space) ||
                keyboard.wasKeyPressed(IO.KEYS.Up) ||
                keyboard.wasAsciiPressed("W") ||
                (pointer.activated() && pointer.primary.y < halfHeight) ||
                isSwimTouch
            ) {
                if (this.gameStarted) {
                    swim = true;
                }
            }
            if (keyboard.isKeyDown(IO.KEYS.Left) ||
                keyboard.isAsciiDown("A") ||
                (pointer.primary && pointer.primary.y > halfHeight && pointer.primary.x < halfWidth) ||
                isLeftTouch
            ) {
                steer = 1;
            }
            if (keyboard.isKeyDown(IO.KEYS.Right) ||
                keyboard.isAsciiDown("D") ||
                (pointer.primary && pointer.primary.y > halfHeight && pointer.primary.x > halfWidth) ||
                isRightTouch
            ) {
                steer = -1;
            }
        }

        this.urchinAnim.update(elapsed);
        this.starAnim.update(elapsed);

        for (var t = 0; t < this.things.length; ++t) {
            var thing = this.things[t];
            thing.update(elapsed);
        }

        var collected = this.jellyfish.update(this.gameStarted && !this.editing, elapsed, swim, steer, this.obstacles);
        this.towerRotation = this.jellyfish.positionAngle;
        this.eyeHeight = this.jellyfish.height;

        if (collected) {
            if (this.dyingStar) {
                this.dyingStar.thing.dieAnim = null;
            }
            collected.thing.dieAnim = this.starDieFlip.setupPlayback(50, false);
            this.dyingStar = collected;
        }

        if (this.dyingStar && this.dyingStar.thing.dieAnim.update(elapsed)) {
            this.dyingStar.thing.dieAnim = null;
            this.dyingStar = null;
        }

        var collectedCount = 0;
        for (var s = 0; s < this.stars.length; ++s) {
            if (this.stars[s].collected) {
                ++collectedCount;
            }
        }

        this.updateScore(width, height, collectedCount);

        if (this.winState === null && !this.dyingStar && collectedCount >= this.winCount && this.jellyfish.alive) {
            this.winState = WIN_TIME;
            this.winSound.play();
            this.winOverlay.classList.remove("hidden");
            this.tint = 0.5;
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
        if (this.loadState !== null) {
            return;
        }

        var tintUniform = room.gl.getUniformLocation(this.program.shader, "uTint");
        room.gl.uniform4f(tintUniform, 0.0, 0.0, 0.0, this.tint);

        if (room.viewer.showOnPrimary()) {
            var eye = this.eyePosition(),
                drawHeight = 3;
            room.viewer.positionView(eye, new R3.V(0, this.eyeHeight, 0), new R3.V(0, 1, 0));
            room.setupView(this.program, this.viewport);
            room.gl.depthMask(true);
            for (var t = 0; t < this.things.length; ++t) {
                var thing = this.things[t];
                if (t < 2 || Math.abs(thing.position.y - eye.y) < drawHeight) {
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

            if (this.dyingStar) {
                starMesh = this.dyingStar.thing.dieAnim.mesh();
                room.bindMeshGeometry(starMesh, this.program);
                room.bindMeshTexture(starMesh, this.program);
                room.drawMeshElements(starMesh, this.program, this.dyingStar.thing.renderTransform(eye));
            }
        }
    };

    function start() {
        if (MAIN.runTestSuites() === 0) {
            console.log("All Tests Passed!");
        }
        var score = document.getElementById("score"),
            canvas = document.getElementById("canvas3D"),
            tank = new Tank("safe", score);
        tank.inputElement = document;
        MAIN.start(canvas, tank);

        window.addEventListener("mouseDown", function(e) {
            window.focus();
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }

    window.onload = function(e) {
        MAIN.setupToggleControls();
        start();
    };

    return {
    };
}());
