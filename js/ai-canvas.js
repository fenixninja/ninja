(function() {
    'use strict';

    // ===== CONSTANTS & VARIABLES ===== //
    const STEP_LENGTH = 1;
    const CELL_SIZE = 8;
    const BORDER_WIDTH = 2;
    const MAX_FONT_SIZE = 500;
    const MAX_ELECTRONS = 100;
    const CELL_DISTANCE = CELL_SIZE + BORDER_WIDTH;

    // Cell repaint interval
    const CELL_REPAINT_INTERVAL = [300, 500];

    // Colors adapted to theme
    const BG_COLOR = "#0F0F0F";
    const BORDER_COLOR = "#13191f";
    const CELL_HIGHLIGHT = "#F25C1F";
    const ELECTRON_COLOR = "#F2F2F0";
    const FONT_COLOR = "#F25C1F";

    const FONT_FAMILY = 'Ethnocentric, Arial, sans-serif';

    const DPR = window.devicePixelRatio || 1;

    const ACTIVE_ELECTRONS = [];
    const PINNED_CELLS = [];

    const MOVE_TRAILS = [
        [0, 1], // down
        [0, -1], // up
        [1, 0], // right
        [-1, 0] // left
    ].map(([x, y]) => [x * CELL_DISTANCE, y * CELL_DISTANCE]);

    const END_POINTS_OFFSET = [
        [0, 0], // left top
        [0, 1], // left bottom
        [1, 0], // right top
        [1, 1] // right bottom
    ].map(([x, y]) => [
        x * CELL_DISTANCE - BORDER_WIDTH / 2,
        y * CELL_DISTANCE - BORDER_WIDTH / 2
    ]);

    // ===== DOM ELEMENTS ===== //
    const elements = {
        container: null,
        input: null,
        upload: null
    };

    // ===== UTILITY FUNCTIONS ===== //
    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // ===== CLASSES ===== //
    class FullscreenCanvas {
        constructor(disableScale = false) {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            this.canvas = canvas;
            this.context = context;
            this.disableScale = disableScale;

            this.resizeHandlers = [];
            this.handleResize = debounce(this.handleResize.bind(this), 100);

            this.adjust();
            window.addEventListener("resize", this.handleResize);
        }

        adjust() {
            const { canvas, context, disableScale } = this;
            const container = elements.container;
            
            if (!container) return;

            const rect = container.getBoundingClientRect();
            this.width = rect.width;
            this.height = rect.height;

            const scale = disableScale ? 1 : DPR;

            this.realWidth = canvas.width = rect.width * scale;
            this.realHeight = canvas.height = rect.height * scale;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            context.scale(scale, scale);
        }

        clear() {
            const { context } = this;
            context.clearRect(0, 0, this.width, this.height);
        }

        makeCallback(fn) {
            fn(this.context, this);
        }

        blendBackground(background, opacity = 0.05) {
            return this.paint((ctx, { realWidth, realHeight, width, height }) => {
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = opacity;
                ctx.drawImage(background, 0, 0, realWidth, realHeight, 0, 0, width, height);
            });
        }

        paint(fn) {
            if (typeof fn !== 'function') return;
            const { context } = this;
            context.save();
            this.makeCallback(fn);
            context.restore();
            return this;
        }

        repaint(fn) {
            if (typeof fn !== 'function') return;
            this.clear();
            return this.paint(fn);
        }

        onResize(fn) {
            if (typeof fn !== 'function') return;
            this.resizeHandlers.push(fn);
        }

        handleResize() {
            const { resizeHandlers } = this;
            if (!resizeHandlers.length) return;
            this.adjust();
            resizeHandlers.forEach(handler => this.makeCallback(handler));
        }

        renderIntoView(target) {
            const { canvas } = this;
            this.container = target;
            canvas.style.position = "absolute";
            canvas.style.left = "0px";
            canvas.style.top = "0px";
            target.appendChild(canvas);
        }

        remove() {
            if (!this.container) return;
            try {
                window.removeEventListener("resize", this.handleResize);
                this.container.removeChild(this.canvas);
            } catch (e) {}
        }
    }

    class Electron {
        constructor(x = 0, y = 0, { lifeTime = 3 * 1e3, speed = STEP_LENGTH, color = ELECTRON_COLOR } = {}) {
            this.lifeTime = lifeTime;
            this.expireAt = Date.now() + lifeTime;
            this.speed = speed;
            this.color = color;
            this.radius = BORDER_WIDTH / 2;
            this.current = [x, y];
            this.visited = {};
            this.setDest(this.randomPath());
        }

        randomPath() {
            const { current: [x, y] } = this;
            const { length } = MOVE_TRAILS;
            const [deltaX, deltaY] = MOVE_TRAILS[getRandomInt(0, length - 1)];
            return [x + deltaX, y + deltaY];
        }

        composeCoord(coord) {
            return coord.join(",");
        }

        hasVisited(dest) {
            const key = this.composeCoord(dest);
            return this.visited[key];
        }

        setDest(dest) {
            this.destination = dest;
            this.visited[this.composeCoord(dest)] = true;
        }

        next() {
            let { speed, current, destination } = this;

            if (Math.abs(current[0] - destination[0]) <= speed / 2 &&
                Math.abs(current[1] - destination[1]) <= speed / 2) {
                destination = this.randomPath();
                let tryCnt = 1;
                const maxAttempt = 4;

                while (this.hasVisited(destination) && tryCnt <= maxAttempt) {
                    tryCnt++;
                    destination = this.randomPath();
                }
                this.setDest(destination);
            }

            const deltaX = destination[0] - current[0];
            const deltaY = destination[1] - current[1];

            if (deltaX) {
                current[0] += (deltaX / Math.abs(deltaX)) * speed;
            }
            if (deltaY) {
                current[1] += (deltaY / Math.abs(deltaY)) * speed;
            }

            return [...this.current];
        }

        paintNextTo(layer) {
            const { radius, color, expireAt, lifeTime } = this;
            const [x, y] = this.next();

            layer.paint((ctx) => {
                ctx.globalAlpha = Math.max(0, expireAt - Date.now()) / lifeTime;
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = radius * 5;
                ctx.globalCompositeOperation = "lighter";
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
            });
        }
    }

    class Cell {
        constructor(row = 0, col = 0, {
            electronCount = getRandomInt(1, 4),
            background = ELECTRON_COLOR,
            forceElectrons = false,
            electronOptions = {}
        } = {}) {
            this.background = background;
            this.electronOptions = electronOptions;
            this.forceElectrons = forceElectrons;
            this.electronCount = Math.min(electronCount, 4);
            this.startY = row * CELL_DISTANCE;
            this.startX = col * CELL_DISTANCE;
        }

        delay(ms = 0) {
            this.pin(ms * 1.5);
            this.nextUpdate = Date.now() + ms;
        }

        pin(lifeTime = -1 >>> 1) {
            this.expireAt = Date.now() + lifeTime;
            PINNED_CELLS.push(this);
        }

        scheduleUpdate(t1 = CELL_REPAINT_INTERVAL[0], t2 = CELL_REPAINT_INTERVAL[1]) {
            this.nextUpdate = Date.now() + getRandomInt(t1, t2);
        }

        paintNextTo(layer) {
            const { startX, startY, background, nextUpdate } = this;
            if (nextUpdate && Date.now() < nextUpdate) return;
            this.scheduleUpdate();
            this.createElectrons();

            layer.paint((ctx) => {
                ctx.globalCompositeOperation = "lighter";
                ctx.fillStyle = background;
                ctx.fillRect(startX, startY, CELL_SIZE, CELL_SIZE);
            });
        }

        popRandom(arr = []) {
            const ramIdx = getRandomInt(0, arr.length - 1);
            return arr.splice(ramIdx, 1)[0];
        }

        createElectrons() {
            const { startX, startY, electronCount, electronOptions, forceElectrons } = this;
            if (!electronCount) return;

            const endpoints = [...END_POINTS_OFFSET];
            const max = forceElectrons ? electronCount : Math.min(electronCount, MAX_ELECTRONS - ACTIVE_ELECTRONS.length);

            for (let i = 0; i < max; i++) {
                const [offsetX, offsetY] = this.popRandom(endpoints);
                ACTIVE_ELECTRONS.push(new Electron(startX + offsetX, startY + offsetY, electronOptions));
            }
        }
    }

    // ===== CANVAS LAYERS ===== //
    let bgLayer, mainLayer, shapeLayer;

    // ===== MAIN FUNCTIONALITY ===== //
    const shape = {
        lastText: "",
        lastImage: null,
        lastMatrix: null,
        renderID: undefined,
        isAlive: false,

        get electronOptions() {
            return {
                speed: 2,
                color: FONT_COLOR,
                lifeTime: getRandomInt(300, 500)
            };
        },

        get cellOptions() {
            return {
                background: FONT_COLOR,
                electronCount: getRandomInt(1, 4),
                electronOptions: this.electronOptions
            };
        },

        get explodeOptions() {
            return {
                ...this.cellOptions,
                electronOptions: {
                    ...this.electronOptions,
                    lifeTime: getRandomInt(500, 1500)
                }
            };
        },

        init(container) {
            if (this.isAlive) return;

            elements.container = container;

            bgLayer = new FullscreenCanvas();
            mainLayer = new FullscreenCanvas();
            shapeLayer = new FullscreenCanvas(true);

            bgLayer.onResize(drawGrid);
            mainLayer.onResize(prepaint);
            mainLayer.renderIntoView(container);

            shapeLayer.onResize(() => {
                if (this.lastText) {
                    this.fillText(this.lastText);
                } else if (this.lastImage) {
                    this.drawImage(this.lastImage);
                }
            });

            prepaint();
            render();

            this.unbindEvents = handlePointer();
            this.isAlive = true;
        },

        clear() {
            const { lastMatrix } = this;
            this.lastText = "";
            this.lastImage = null;
            this.lastMatrix = null;
            PINNED_CELLS.length = 0;

            if (lastMatrix) {
                this.explode(lastMatrix);
            }
        },

        destroy() {
            if (!this.isAlive) return;

            bgLayer.remove();
            mainLayer.remove();
            shapeLayer.remove();

            this.unbindEvents();
            cancelAnimationFrame(this.renderID);

            ACTIVE_ELECTRONS.length = PINNED_CELLS.length = 0;
            this.lastMatrix = null;
            this.lastText = "";
            this.isAlive = false;
        },

        getMatrix() {
            const { width, height } = shapeLayer;
            const pixels = shapeLayer.context.getImageData(0, 0, width, height).data;
            const matrix = [];

            for (let i = 0; i < height; i += CELL_DISTANCE) {
                for (let j = 0; j < width; j += CELL_DISTANCE) {
                    const alpha = pixels[(j + i * width) * 4 + 3];
                    if (alpha > 0) {
                        matrix.push([
                            Math.floor(i / CELL_DISTANCE),
                            Math.floor(j / CELL_DISTANCE)
                        ]);
                    }
                }
            }
            return matrix;
        },

        drawImage(image) {
            const { naturalWidth: width, naturalHeight: height } = image;
            const scaleRatio = Math.min(
                (shapeLayer.width * 0.8) / width,
                (shapeLayer.height * 0.8) / height
            );

            this.clear();
            this.spiral();

            this.lastText = "";
            this.lastImage = image;

            shapeLayer.repaint((ctx) => {
                ctx.drawImage(
                    image,
                    (shapeLayer.width - width * scaleRatio) / 2,
                    (shapeLayer.height - height * scaleRatio) / 2,
                    width * scaleRatio,
                    height * scaleRatio
                );
                this.render();
            });
        },

        fillText(text, { fontWeight = "bold", fontFamily = FONT_FAMILY } = {}) {
            const { width, height } = shapeLayer;
            const isBlank = !!this.lastText;

            this.clear();

            if (text !== 0 && !text) {
                if (isBlank) {
                    this.spiral({
                        reverse: true,
                        lifeTime: 500,
                        electronCount: 2
                    });
                }
                return;
            }

            this.spiral();
            this.lastImage = null;
            this.lastText = text;

            shapeLayer.repaint((ctx) => {
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.font = `${fontWeight} ${MAX_FONT_SIZE}px ${fontFamily}`;

                const scale = width / ctx.measureText(text).width;
                const fontSize = Math.min(MAX_FONT_SIZE, MAX_FONT_SIZE * scale * 0.8);

                ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                ctx.fillText(text, width / 2, height / 2);

                this.render();
            });
        },

        render() {
            const matrix = (this.lastMatrix = shuffle(this.getMatrix()));
            matrix.forEach(([i, j]) => {
                const cell = new Cell(i, j, this.cellOptions);
                cell.scheduleUpdate(200);
                cell.pin();
            });
        },

        spiral({
            radius,
            increment = 0,
            reverse = false,
            lifeTime = 250,
            electronCount = 1,
            forceElectrons = true
        } = {}) {
            const { width, height } = mainLayer;
            const cols = Math.floor(width / CELL_DISTANCE);
            const rows = Math.floor(height / CELL_DISTANCE);
            const ox = Math.floor(cols / 2);
            const oy = Math.floor(rows / 2);

            let cnt = 1;
            let deg = getRandomInt(0, 360);
            let r = radius === undefined ? Math.floor(Math.min(cols, rows) / 3) : radius;

            const step = reverse ? 15 : -15;
            const max = Math.abs(360 / step);

            while (cnt <= max) {
                const i = oy + Math.floor(r * Math.sin((deg / 180) * Math.PI));
                const j = ox + Math.floor(r * Math.cos((deg / 180) * Math.PI));

                const cell = new Cell(i, j, {
                    electronCount,
                    forceElectrons,
                    background: CELL_HIGHLIGHT,
                    electronOptions: {
                        lifeTime,
                        speed: 3,
                        color: CELL_HIGHLIGHT
                    }
                });

                cell.delay(cnt * 16);
                cnt++;
                deg += step;
                r += increment;
            }
        },

        explode(matrix) {
            stripOld();

            if (matrix) {
                const { length } = matrix;
                const max = Math.min(50, getRandomInt(Math.floor(length / 20), Math.floor(length / 10)));

                for (let idx = 0; idx < max; idx++) {
                    const [i, j] = matrix[idx];
                    const cell = new Cell(i, j, this.explodeOptions);
                    cell.paintNextTo(mainLayer);
                }
            } else {
                const max = getRandomInt(10, 20);
                for (let idx = 0; idx < max; idx++) {
                    createRandomCell(this.explodeOptions);
                }
            }
        }
    };

    // ===== HELPER FUNCTIONS ===== //
    function shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function stripOld(limit = 1000) {
        const now = Date.now();
        for (let i = 0, max = ACTIVE_ELECTRONS.length; i < max; i++) {
            const e = ACTIVE_ELECTRONS[i];
            if (e.expireAt - now < limit) {
                ACTIVE_ELECTRONS.splice(i, 1);
                i--;
                max--;
            }
        }
    }

    function createRandomCell(options = {}) {
        if (ACTIVE_ELECTRONS.length >= MAX_ELECTRONS) return;
        const { width, height } = mainLayer;
        const cell = new Cell(
            getRandomInt(0, height / CELL_DISTANCE),
            getRandomInt(0, width / CELL_DISTANCE),
            options
        );
        cell.paintNextTo(mainLayer);
    }

    function drawGrid() {
        bgLayer.paint((ctx, { width, height }) => {
            ctx.fillStyle = BG_COLOR;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = BORDER_COLOR;

            // horizontal lines
            for (let h = CELL_SIZE; h < height; h += CELL_DISTANCE) {
                ctx.fillRect(0, h, width, BORDER_WIDTH);
            }

            // vertical lines
            for (let w = CELL_SIZE; w < width; w += CELL_DISTANCE) {
                ctx.fillRect(w, 0, BORDER_WIDTH, height);
            }
        });
    }

    function iterateItemsIn(list) {
        const now = Date.now();
        for (let i = 0, max = list.length; i < max; i++) {
            const item = list[i];
            if (now >= item.expireAt) {
                list.splice(i, 1);
                i--;
                max--;
            } else {
                item.paintNextTo(mainLayer);
            }
        }
    }

    function drawItems() {
        iterateItemsIn(PINNED_CELLS);
        iterateItemsIn(ACTIVE_ELECTRONS);
    }

    let nextRandomAt;

    function activateRandom() {
        const now = Date.now();
        if (now < nextRandomAt) return;
        nextRandomAt = now + getRandomInt(300, 1000);
        createRandomCell();
    }

    function handlePointer() {
        let lastCell = [];
        let touchRecords = {};

        function isSameCell(i, j) {
            const [li, lj] = lastCell;
            lastCell = [i, j];
            return i === li && j === lj;
        }

        function print(isMove, { clientX, clientY }) {
            const rect = elements.container.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            const i = Math.floor(y / CELL_DISTANCE);
            const j = Math.floor(x / CELL_DISTANCE);

            if (isMove && isSameCell(i, j)) return;

            const cell = new Cell(i, j, {
                background: CELL_HIGHLIGHT,
                forceElectrons: true,
                electronCount: isMove ? 2 : 4,
                electronOptions: {
                    speed: 3,
                    lifeTime: isMove ? 500 : 1000,
                    color: CELL_HIGHLIGHT
                }
            });

            cell.paintNextTo(mainLayer);
        }

        const handlers = {
            touchend({ changedTouches }) {
                if (changedTouches) {
                    Array.from(changedTouches).forEach(({ identifier }) => {
                        delete touchRecords[identifier];
                    });
                } else {
                    touchRecords = {};
                }
            }
        };

        function filterTouches(touchList) {
            return Array.from(touchList).filter(({ identifier, clientX, clientY }) => {
                const rec = touchRecords[identifier];
                touchRecords[identifier] = { clientX, clientY };
                return !rec || clientX !== rec.clientX || clientY !== rec.clientY;
            });
        }

        ["mousedown", "touchstart", "mousemove", "touchmove"].forEach((name) => {
            const isMove = /move/.test(name);
            const isTouch = /touch/.test(name);
            const fn = print.bind(null, isMove);

            handlers[name] = function handler(evt) {
                if (isTouch) {
                    filterTouches(evt.touches).forEach(fn);
                } else {
                    fn(evt);
                }
            };
        });

        const events = Object.keys(handlers);
        events.forEach((name) => {
            elements.container.addEventListener(name, handlers[name]);
        });

        return function unbind() {
            events.forEach((name) => {
                elements.container.removeEventListener(name, handlers[name]);
            });
        };
    }

    function prepaint() {
        drawGrid();
        mainLayer.paint((ctx, { width, height }) => {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, width, height);
        });
        mainLayer.blendBackground(bgLayer.canvas, 0.9);
    }

    function render() {
        mainLayer.blendBackground(bgLayer.canvas);
        drawItems();
        activateRandom();
        shape.renderID = requestAnimationFrame(render);
    }

    // ===== COMMAND FUNCTIONS ===== //
    let timer;

    function queue() {
        const text = "naïve";
        let i = 0;
        const max = text.length;

        const run = () => {
            if (i >= max) return;
            shape.fillText(text.slice(0, ++i));
            timer = setTimeout(run, 1e3 + i);
        };
        run();
    }

    function countdown() {
        const arr = [3, 2, 1];
        let i = 0;
        const max = arr.length;

        const run = () => {
            if (i >= max) {
                shape.clear();
                return galaxy();
            }
            shape.fillText(arr[i++]);
            setTimeout(run, 1e3 + i);
        };
        run();
    }

    function galaxy() {
        shape.spiral({
            radius: 0,
            increment: 1,
            lifeTime: 100,
            electronCount: 1
        });
        timer = setTimeout(galaxy, 16);
    }

    function ring() {
        shape.spiral();
        timer = setTimeout(ring, 16);
    }

    function elder() {
        processImage("data:image/png;base64,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");
    }

    function elder2() {
        processImage("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gPGc+ICA8dGl0bGU+YmFja2dyb3VuZDwvdGl0bGU+ICA8cmVjdCBmaWxsPSJub25lIiBpZD0iY2FudmFzX2JhY2tncm91bmQiIGhlaWdodD0iMjAyIiB3aWR0aD0iNDAyIiB5PSItMSIgeD0iLTEiLz4gPC9nPiA8Zz4gIDx0aXRsZT5MYXllciAxPC90aXRsZT4gIDxnIHN0cm9rZT0iIzAwMCIgZmlsbD0ibm9uZSIgaWQ9ImdsYXNzIj4gICA8cGF0aCBpZD0ic3ZnXzEiIGQ9Im0xMzUuNjI1LDE0bDQ2LjUsMGwwLDMzbC00Ni41LDBsMCwtMzN6IiBzdHJva2Utd2lkdGg9IjEwIi8+ICAgPHBhdGggaWQ9InN2Z18yIiBkPSJtMjI1LjYyNSwxNGw0Ni41LDBsMCwzM2wtNDYuNSwwbDAsLTMzeiIgc3Ryb2tlLXdpZHRoPSIxMCIvPiAgIDxwYXRoIGlkPSJzdmdfMyIgZD0ibTE4NC4zNzUsMzEuMDE0bDM3LDAiIHN0cm9rZS13aWR0aD0iOSIvPiAgPC9nPiAgPGcgaWQ9Ii4uIj4gICA8cGF0aCBpZD0ic3ZnXzQiIGQ9Im0xODYuNzIsODkuNjk1cS0zLjk2LDAgLTYuNDgsLTIuNTJxLTIuNTIsLTIuNyAtMi41MiwtNi40OHEwLC0zLjc4IDIuNTIsLTYuM3EyLjUyLC0yLjcgNi40OCwtMi43cTMuNzgsMCA2LjMsMi43cTIuNTIsMi41MiAyLjUyLDYuM3QtMi41Miw2LjQ4cS0yLjUyLDIuNTIgLTYuMywyLjUyeiIvPiAgIDxwYXRoIGlkPSJzdmdfNSIgZD0ibTIyMS4yOCw4OS42OTVxLTMuNzgsMCAtNi4zLC0yLjUycS0yLjUyLC0yLjcgLTIuNTIsLTYuNDhxMCwtMy43OCAyLjUyLC02LjNxMi41MiwtMi43IDYuMywtMi43cTMuOTYsMCA2LjQ4LDIuN3EyLjUyLDIuNTIgMi41Miw2LjN0LTIuNTIsNi40OHEtMi41MiwyLjUyIC02LjQ4LDIuNTJ6Ii8+ICA8L2c+ICA8ZyBmaWxsLW9wYWNpdHk9IjAuMiIgaWQ9Im5haXZlIj4gICA8cGF0aCBpZD0ic3ZnXzYiIGQ9Im03Ljc4LDEwNy44NzVsMTIuMjQsMGwxLjI2LDEyLjZsMC41NCwwcTYuMywtNi4zIDEzLjE0LC0xMC40NHE3LjAyLC00LjMyIDE2LjIsLTQuMzJxMTMuODYsMCAyMC4xNiw4LjY0cTYuNDgsOC42NCA2LjQ4LDI1LjU2bDAsNTUuNDRsLTE0Ljc2LDBsMCwtNTMuNDZxMCwtMTIuNDIgLTMuOTYsLTE3LjgycS0zLjk2LC01LjU4IC0xMi42LC01LjU4cS02Ljg0LDAgLTEyLjA2LDMuNDJxLTUuMjIsMy40MiAtMTEuODgsMTAuMDhsMCw2My4zNmwtMTQuNzYsMGwwLC04Ny40OHoiLz4gICA8cGF0aCBpZD0ic3ZnXzciIGQ9Im0xMjYuMzgsMTk3LjUxNXEtMTAuOTgsMCAtMTguMzYsLTYuNDhxLTcuMiwtNi40OCAtNy4yLC0xOC4zNnEwLC0xNC40IDEyLjc4LC0yMS45NnExMi43OCwtNy43NCA0MC44NiwtMTAuOHEwLC00LjE0IC0wLjksLTguMXEtMC43MiwtMy45NiAtMi43LC03LjAycS0xLjk4LC0zLjA2IC01LjU4LC00Ljg2cS0zLjQyLC0xLjk4IC04LjgyLC0xLjk4cS03LjU2LDAgLTE0LjIyLDIuODhxLTYuNjYsMi44OCAtMTEuODgsNi40OGwtNS43NiwtMTAuMjZxNi4xMiwtMy45NiAxNC45NCwtNy41NnE4LjgyLC0zLjc4IDE5LjQ0LC0zLjc4cTE2LjAyLDAgMjMuMjIsOS45cTcuMiw5LjcyIDcuMiwyNi4xbDAsNTMuNjRsLTEyLjI0LDBsLTEuMjYsLTEwLjQ0bC0wLjU0LDBxLTYuMyw1LjIyIC0xMy41LDlxLTcuMiwzLjYgLTE1LjQ4LDMuNnptNC4zMiwtMTEuODhxNi4zLDAgMTEuODgsLTIuODhxNS41OCwtMy4wNiAxMS44OCwtOC44MmwwLC0yNC4zcS0xMC45OCwxLjQ0IC0xOC41NCwzLjQycS03LjM4LDEuOTggLTEyLjA2LDQuNjhxLTQuNSwyLjcgLTYuNjYsNi4zcS0xLjk4LDMuNDIgLTEuOTgsNy41NnEwLDcuNTYgNC41LDEwLjhxNC41LDMuMjQgMTAuOTgsMy4yNHoiLz4gICA8cGF0aCBpZD0ic3ZnXzgiIGQ9Im0xOTYuOTIyLDEwNy44NzVsMTQuNzYsMGwwLDg3LjQ4bC0xNC43NiwwbDAsLTg3LjQ4eiIvPiAgIDxwYXRoIGlkPSJzdmdfOSIgZD0ibTIyOC42MiwxMDcuODc1bDE1LjMsMGwxNi41Niw0OS42OGwzLjk2LDEyLjk2cTIuMTYsNi40OCA0LjE0LDEyLjc4bDAuNzIsMHExLjk4LC02LjMgMy45NiwtMTIuNzhsMy45NiwtMTIuOTZsMTYuNTYsLTQ5LjY4bDE0LjU4LDBsLTMwLjk2LDg3LjQ4bC0xNy4yOCwwbC0zMS41LC04Ny40OHoiLz4gICA8cGF0aCBpZD0ic3ZnXzEwIiBkPSJtMzYwLDE5Ny41MTVxLTguODIsMCAtMTYuNTYsLTMuMDZxLTcuNTYsLTMuMjQgLTEzLjMyLC05cS01LjU4LC01Ljk0IC04LjgyLC0xNC40dC0zLjI0LC0xOS4yNnEwLC0xMC44IDMuMjQsLTE5LjI2cTMuNDIsLTguNjQgOC44MiwtMTQuNThxNS41OCwtNS45NCAxMi42LC05cTcuMDIsLTMuMjQgMTQuNTgsLTMuMjRxOC4yOCwwIDE0Ljc2LDIuODhxNi42NiwyLjg4IDEwLjk4LDguMjhxNC41LDUuNCA2Ljg0LDEyLjk2cTIuMzQsNy41NiAyLjM0LDE2LjkycTAsMi4zNCAtMC4xOCw0LjY4cTAsMi4xNiAtMC4zNiwzLjc4bC01OS4wNCwwcTAuOSwxNC4wNCA4LjY0LDIyLjMycTcuOTIsOC4xIDIwLjUyLDguMXE2LjMsMCAxMS41MiwtMS44cTUuNCwtMS45OCAxMC4yNiwtNS4wNGw1LjIyLDkuNzJxLTUuNzYsMy42IC0xMi43OCw2LjNxLTcuMDIsMi43IC0xNi4wMiwyLjd6bTE5LjI2LC01Mi45MnEwLC0xMy4zMiAtNS43NiwtMjAuMTZxLTUuNTgsLTcuMDIgLTE1Ljg0LC03LjAycS00LjY4LDAgLTksMS44cS00LjE0LDEuOCAtNy41Niw1LjRxLTMuNDIsMy40MiAtNS43Niw4LjQ2cS0yLjE2LDUuMDQgLTIuODgsMTEuNTJsNDYuOCwweiIvPiAgPC9nPiA8L2c+PC9zdmc+");
    }

    function processImage(src) {
        const image = new Image();
        image.onload = () => {
            shape.drawImage(image);
        };
        image.onerror = () => {
            shape.fillText("AI");
        };
        image.src = src;
    }

    // ===== INITIALIZATION ===== //
    function initAICanvas() {
        elements.container = document.getElementById('ai-canvas-container');
        elements.input = document.getElementById('ai-input');
        elements.upload = document.getElementById('ai-upload');

        if (!elements.container) return;

        // Initialize shape
        shape.init(elements.container);
        
        // Start with elder effect
        elder();

        // Setup input handler
        elements.input.addEventListener("keypress", ({ keyCode, target }) => {
            if (keyCode === 13) {
                clearTimeout(timer);
                const value = target.value.trim();
                target.value = "";

                switch (value) {
                    case "#destroy":
                        return shape.destroy();
                    case "#init":
                        return shape.init(elements.container);
                    case "#explode":
                        return shape.explode();
                    case "#clear":
                        return shape.clear();
                    case "#queue":
                        return queue();
                    case "#countdown":
                        return countdown();
                    case "#galaxy":
                        shape.clear();
                        return galaxy();
                    case "#ring":
                        shape.clear();
                        return ring();
                    case "#naive":
                        shape.clear();
                        return elder2();
                    case "#elder":
                    case "🐸":
                        shape.clear();
                        return elder();
                    default:
                        return shape.fillText(value);
                }
            }
        });

        // Setup upload handler
        elements.upload.addEventListener("change", () => {
            const file = elements.upload.files[0];
            if (!file) return elder2();
            processImage(URL.createObjectURL(file));
        });

        // Prevent touch zooming
        document.addEventListener("touchmove", (e) => e.preventDefault());
    }

    // Public API
    window.AICanvas = {
        init: initAICanvas,
        destroy: () => shape.destroy()
    };

})(); 
