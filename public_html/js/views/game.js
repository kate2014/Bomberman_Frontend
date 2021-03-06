define(function (require) {
    var gameInit = require('views/GameModules/gameInit');
    var baseView = require('views/baseView');
    var tmpl = require('tmpl/game');
    var app = require('app');
    var gameObjects = require('views/GameModules/gameObjects');
    var Character = require('views/GameModules/character');
    var ws = require('utils/ws');
	var tileFactory = require('views/GameModules/tileFactory');
    var Bomb = require('views/GameModules/bomb');
    var bombRey = require('views/GameModules/bombRey');
	var globalScale = require('utils/globalScale');
	
    var View = baseView.extend({
        template: tmpl,
        pingTimer: null,
        requireAuth: true,
        gameStartedId: null,
        previousCoordinates: {},
        initialize: function () {
            this.render();
            gameInit.init();
            Bomb.init();
            
            this.listenTo(app.Events, "needToReloadGame", this.deallocGame);
            this.listenTo(app.wsEvents, "object_spawned", this.addObject);
            this.listenTo(app.wsEvents, "bomberman_spawned", this.spawnBomberman);
            this.listenTo(app.wsEvents, "object_destroyed", this.destroyObject);
            this.listenTo(app.wsEvents, "game_over", this.gameOver);
            this.listenTo(app.wsEvents, "object_changed", this.moveBomberman);
        },
        show: function () {
            baseView.prototype.show.call(this);
            this.startGame();
            this.pingTimer = setInterval(function () {
                ws.sendPing()
            }, 10000);
            var gameDiv = jQuery('#game');
            gameDiv.attr("contentEditable", "true");
            gameDiv[0].contentEditable = true;
            gameDiv.focus();
        },
        hide: function () {
            baseView.prototype.hide.call(this);
            this.endGame();
        },
        startGame: function () {
            var self = this;
            var lastLoop = new Date;
			Character.resetCounter();
            gameInit.addToDOM();
            function animate() {
                self.gameStartedId = requestAnimationFrame(animate);
                var thisLoop = new Date;
                gameObjects.fps = 1000 / (thisLoop - lastLoop);
                lastLoop = thisLoop;
                gameInit.frame();
            }
            animate();  
        },
        deallocGame: function () {
            if (ws.socket.readyState != 3) {
                ws.closeConnection();
                clearInterval(this.pingTimer);
            }
            gameInit.dealloc();
            app.gameReady = false;
            gameInit.init();
        },
        endGame: function () {
            if (this.gameStartedId != null) {
                if (ws.socket.readyState != 3) {
                    ws.closeConnection();
                    clearInterval(this.pingTimer);
                }
                cancelAnimationFrame(this.gameStartedId);
                this.gameStartedId = null;
                gameInit.dealloc();
                $('canvas').remove();
                app.gameReady = false;
                gameInit.init();
            }
        },
        gameOver: function (data) {
            var self = this;
            this.$('.gameover').fadeIn();
            if (data.id != null) {
                this.$('.gameover').append("<p class='gameover_text'>"  + 'Winner: '  + gameObjects.playerNicks[data.id] + "</p>");
            } else {
                this.$('.gameover').append("<p class='gameover_text'>" + 'Game Draw' + "</p>");
            }
            app.fetchNewScoreboard();
            setTimeout(function () {
                self.endGame();
                self.$('.gameover_text').remove();
                self.$('.gameover').fadeOut();
                window.location.href = '#main'
            }, 4500);
        },
        spawnBomberman: function (data) {
            if (data.user_id === app.user.get('id')) {
                gameObjects.playersCharacter = new Character.init({
                        color: Math.random() * 0xffffff}, {x: data.x, z: data.y}, data.user_id);
                gameObjects.playersCharacter.name = data.id;
                gameObjects.objects[data.id] =  {
                  index: gameObjects.playersCharacter
                };
                gameObjects.scene.add(gameObjects.objects[data.id].index.mesh);
                this.previousCoordinates[data.id] = {
                    x: gameObjects.objects[data.id].index.mesh.position.x,
                    z: gameObjects.objects[data.id].index.mesh.position.z

                };
                if (data.y > 15) {
                    gameObjects.playersCharacter.setControls('top');
                    gameObjects.playersCharacterLook = -950 * globalScale;
                } else {
                    gameObjects.playersCharacter.setControls('bot');
                    gameObjects.playersCharacterLook = 950 * globalScale;
                }
            } else {
                gameObjects.objects[data.id] = {
                   index: new Character.init({
                        color: Math.random() * 0xffffff}, 
                       {x: data.x, z: data.y}, data.user_id)
                    };
                this.previousCoordinates[data.id] = {
                    x: gameObjects.objects[data.id].index.mesh.position.x,
                    z: gameObjects.objects[data.id].index.mesh.position.z
                };
                gameObjects.scene.add(gameObjects.objects[data.id].index.mesh);
            }
        },
        addObject: function (data) {
            switch (data.object_type) {
                case 'destructible_wall': {
                    tileFactory.spawnRandomDestructibleWallAt(data.id, data.x, data.y);
                    break
                }
                case 'undestructible_wall': {
                    tileFactory.spawnRandomIndestructibleWallAt(data.id, data.x, data.y);
                    break
                }
                case 'bonus_increase_bomb_range': {
                    tileFactory.spawnBonusByNameAt('4arrows', data.id, data.x, data.y);
                    break
                }
                case 'bonus_decrease_bomb_spawn_delay': {
                    tileFactory.spawnBonusByNameAt('time', data.id, data.x, data.y);
                    break
                }
                case 'bonus_increase_speed': {
                    tileFactory.spawnBonusByNameAt('boots', data.id, data.x, data.y);
                    break
                }
                case 'bonus_increase_max_hp': {
                    tileFactory.spawnBonusByNameAt('heart', data.id, data.x, data.y);
                    break
                }
                case 'bomb_ray': {
                    var rey = new bombRey.init();
                    var coords = gameObjects.getRealCoordinates(data.x, data.y);
                    rey.group.mesh.position.set(coords.x, 42 * globalScale, coords.z);
                    rey.shockwaveGroup.mesh.position.set(coords.x, 42 * globalScale, coords.z);
                    gameObjects.bombReys[data.id] = rey;
                    gameObjects.scene.add(rey.shockwaveGroup.mesh);
                    gameObjects.scene.add(rey.group.mesh);
                    setTimeout(function () {
                        gameObjects.deleteBombRey(data.id);
                    }, 2100);
                    break
                }
                case 'bonus_drop_bomb_on_death': {
                    tileFactory.spawnBonusByNameAt('death', data.id, data.x, data.y);
                    break
                }
                case 'bonus_invulnerability': {
                    tileFactory.spawnBonusByNameAt('shield', data.id, data.x, data.y);
                    break
                }
                case 'bonus_bombs_amount': {
                    tileFactory.spawnBonusByNameAt('onemorebomb', data.id, data.x, data.y);
                    break
                }
                case 'bomb': {
                    gameObjects.setBomb(data.id, data.x, data.y);
                    return
                }
            }
        },
        destroyObject: function (data) {
            gameObjects.deleteObjectFromWorld(data.id);
        },
        moveBomberman: function (data) {
            var fetchedCoordinates = gameObjects.getBomberManRealCoordinates(data.x, data.y);
            gameObjects.objects[data.id].index.mesh.position.x = this.previousCoordinates[data.id].x;
            gameObjects.objects[data.id].index.mesh.position.z = this.previousCoordinates[data.id].z;
            this.previousCoordinates[data.id].x = fetchedCoordinates.x;
            this.previousCoordinates[data.id].z = fetchedCoordinates.z;
            var vector = {
                x: fetchedCoordinates.x - gameObjects.objects[data.id].index.mesh.position.x,
                z: fetchedCoordinates.z - gameObjects.objects[data.id].index.mesh.position.z
            };
            vector.x = vector.x > 0 ? 1 : vector.x < 0 ? -1 : 0;
            vector.z = vector.z > 0 ? 1 : vector.z < 0 ? -1 : 0;
            if (vector.x != 0 || vector.z != 0) {
                gameObjects.objects[data.id].index.rotate(vector.x, vector.z);
                gameObjects.objects[data.id].index.move();
            }
        }
    });
    return new View();

});
