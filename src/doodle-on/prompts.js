/* Round content: the starting shapes and the creative directions.
 *
 * Pure data and geometry — no DOM, no game state, no lifecycle. Split out of
 * game.js because it is the one part of this game with an obvious standalone
 * edit ("add more shapes", "add more directions"), and because Rollup inlines
 * a single-importer module into the page's entry chunk, so it costs no extra
 * request (ARCHITECTURE.md §22).
 *
 * The pairing is deliberately mismatched: a generic direction can never
 * "match" a primitive, which is the whole game. 8 shapes x 14 directions is
 * 112 pairings from ~40 lines of content, so the game never acquires a
 * content-generation problem. */

var TAU = Math.PI * 2;

/* Every draw() works inside a 0..1 unit square. drawShape() has already
 * translated to the shape's top-left corner and scaled uniformly, and has
 * divided the line width by that scale to compensate, so these bodies stay
 * pure geometry. Uniform scale only — arc() would distort under a
 * non-uniform one.
 *
 * Nothing here may be dashed. A dashed template reads better as "this bit was
 * given to you", but every gap in a dash is an alpha-0 pixel and the paint
 * bucket floods straight through it: the shape has to be a real fill
 * boundary. Pale and solid is the only treatment that is both. */
var SHAPES = {
  circle: {
    label: "circle",
    draw: function (c) {
      c.arc(0.5, 0.5, 0.46, 0, TAU);
    },
  },
  square: {
    label: "square",
    draw: function (c) {
      c.rect(0.06, 0.06, 0.88, 0.88);
    },
  },
  triangle: {
    label: "triangle",
    draw: function (c) {
      c.moveTo(0.5, 0.05);
      c.lineTo(0.95, 0.9);
      c.lineTo(0.05, 0.9);
      c.closePath();
    },
  },
  arc: {
    label: "arc",
    draw: function (c) {
      c.arc(0.5, 0.62, 0.46, Math.PI * 1.12, Math.PI * 1.88);
    },
  },
  zigzag: {
    label: "zigzag",
    draw: function (c) {
      c.moveTo(0.04, 0.66);
      for (var i = 1; i <= 6; i++) {
        c.lineTo(0.04 + i * 0.16, i % 2 ? 0.34 : 0.66);
      }
    },
  },
  spiral: {
    label: "spiral",
    draw: function (c) {
      var turns = TAU * 2.4;
      for (var t = 0; t <= turns; t += 0.12) {
        var r = 0.05 + (t / turns) * 0.42;
        var x = 0.5 + Math.cos(t) * r;
        var y = 0.5 + Math.sin(t) * r;
        t === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
    },
  },
  cross: {
    label: "cross",
    draw: function (c) {
      c.moveTo(0.5, 0.06);
      c.lineTo(0.5, 0.94);
      c.moveTo(0.06, 0.5);
      c.lineTo(0.94, 0.5);
    },
  },
  dot: {
    label: "dot",
    fill: true,
    draw: function (c) {
      c.arc(0.5, 0.5, 0.13, 0, TAU);
    },
  },
};

var DIRECTIONS = [
  "something that lives in water",
  "something that flies",
  "something hungry",
  "something asleep",
  "something dangerous",
  "something you can eat",
  "something you can wear",
  "something from space",
  "something with a face",
  "something in a hurry",
  "something very soft",
  "something enormous",
  "something broken",
  "something very old",
];

var SHAPE_KEYS = Object.keys(SHAPES);
var lastShape = -1;
var lastDirection = -1;

/* Uniform over the n-1 indices that are not `avoid`, so a re-roll can never
 * hand back the round the player just had. */
function pickIndex(n, avoid) {
  if (n < 2) return 0;
  if (avoid < 0) return Math.floor(Math.random() * n);
  var i = Math.floor(Math.random() * (n - 1));
  return i >= avoid ? i + 1 : i;
}

export function pickRound() {
  lastShape = pickIndex(SHAPE_KEYS.length, lastShape);
  lastDirection = pickIndex(DIRECTIONS.length, lastDirection);
  var key = SHAPE_KEYS[lastShape];
  return {
    shape: key,
    label: SHAPES[key].label,
    direction: DIRECTIONS[lastDirection],
  };
}

/* Stamps `name` into a k x k box at (ox, oy), all in the caller's coordinate
 * space — which for both canvas layers is CSS pixels, so this inherits the
 * device-pixel-ratio transform for free. */
export function drawShape(c, name, k, ox, oy, color, width) {
  var def = SHAPES[name];
  if (!def) return;
  c.save();
  c.translate(ox, oy);
  c.scale(k, k);
  c.lineWidth = width / k;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = color;
  c.fillStyle = color;
  c.beginPath();
  def.draw(c);
  if (def.fill) c.fill();
  else c.stroke();
  c.restore();
}
