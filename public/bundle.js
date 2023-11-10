(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/**
 * mixmap-pr-speckle-04-01
 * - attempt at getting the speckle pattern
 * - 1 - getting a decent first pass
 * - 2 - perlin noise for water
 * - 3 - up the sample rate just to see how the speckle changes, its nice
 * - 4 - light direction for the land to animate it, first draft, not great
 * - 04-01
 * - fixes 04 light source
 * - allows for force loading terrain tiles
 */
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const geojson2mesh = require('earth-mesh')
const tilebelt = require('@mapbox/tilebelt')
const terrainImgToMesh = require('./terrain-img-to-mesh.js')
const ndarray = require('ndarray')
const vec3 = require('gl-vec3')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const sampleRate = 64

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerWidth/window.innerHeight * prHorizontal)
const prSN = [prCenter - (prHorizontal/2), prCenter + (prHorizontal/2)]

const map = mix.create({
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})

document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))
// setup-map:end

const lightDir = [0,0,1]
const drawTerrainMeshTile = map.createDraw({
  vert: glsl(["\n    precision highp float;\n#define GLSLIFY 1\n\n\n    attribute vec4 position;\n    attribute vec3 normal;\n\n    uniform vec4 viewbox;\n    uniform vec2 offset;\n    uniform float zindex, aspect;\n\n    varying vec4 vPosition;\n    varying vec3 vNormal;\n\n    void main () {\n      vNormal = normalize(normal);\n      vec2 p = position.xy + offset;\n      vPosition = vec4(p.x, p.y, position.z, position.w);\n      gl_Position = vec4(\n        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,\n        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,\n        1.0/(1.0 + zindex),\n        1);\n    }\n  "]),
  frag: glsl(["\n    precision highp float;\n#define GLSLIFY 1\n\n\n    //\n// Description : Array and textureless GLSL 2D/3D/4D simplex\n//               noise functions.\n//      Author : Ian McEwan, Ashima Arts.\n//  Maintainer : ijm\n//     Lastmod : 20110822 (ijm)\n//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.\n//               Distributed under the MIT License. See LICENSE file.\n//               https://github.com/ashima/webgl-noise\n//\n\nvec3 mod289(vec3 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 mod289(vec4 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 permute(vec4 x) {\n     return mod289(((x*34.0)+1.0)*x);\n}\n\nvec4 taylorInvSqrt(vec4 r)\n{\n  return 1.79284291400159 - 0.85373472095314 * r;\n}\n\nfloat snoise(vec3 v)\n  {\n  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;\n  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);\n\n// First corner\n  vec3 i  = floor(v + dot(v, C.yyy) );\n  vec3 x0 =   v - i + dot(i, C.xxx) ;\n\n// Other corners\n  vec3 g_0 = step(x0.yzx, x0.xyz);\n  vec3 l = 1.0 - g_0;\n  vec3 i1 = min( g_0.xyz, l.zxy );\n  vec3 i2 = max( g_0.xyz, l.zxy );\n\n  //   x0 = x0 - 0.0 + 0.0 * C.xxx;\n  //   x1 = x0 - i1  + 1.0 * C.xxx;\n  //   x2 = x0 - i2  + 2.0 * C.xxx;\n  //   x3 = x0 - 1.0 + 3.0 * C.xxx;\n  vec3 x1 = x0 - i1 + C.xxx;\n  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y\n  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y\n\n// Permutations\n  i = mod289(i);\n  vec4 p = permute( permute( permute(\n             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))\n           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))\n           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));\n\n// Gradients: 7x7 points over a square, mapped onto an octahedron.\n// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)\n  float n_ = 0.142857142857; // 1.0/7.0\n  vec3  ns = n_ * D.wyz - D.xzx;\n\n  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)\n\n  vec4 x_ = floor(j * ns.z);\n  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)\n\n  vec4 x = x_ *ns.x + ns.yyyy;\n  vec4 y = y_ *ns.x + ns.yyyy;\n  vec4 h = 1.0 - abs(x) - abs(y);\n\n  vec4 b0 = vec4( x.xy, y.xy );\n  vec4 b1 = vec4( x.zw, y.zw );\n\n  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;\n  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;\n  vec4 s0 = floor(b0)*2.0 + 1.0;\n  vec4 s1 = floor(b1)*2.0 + 1.0;\n  vec4 sh = -step(h, vec4(0.0));\n\n  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;\n  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;\n\n  vec3 p0 = vec3(a0.xy,h.x);\n  vec3 p1 = vec3(a0.zw,h.y);\n  vec3 p2 = vec3(a1.xy,h.z);\n  vec3 p3 = vec3(a1.zw,h.w);\n\n//Normalise gradients\n  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));\n  p0 *= norm.x;\n  p1 *= norm.y;\n  p2 *= norm.z;\n  p3 *= norm.w;\n\n// Mix final noise value\n  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);\n  m = m * m;\n  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),\n                                dot(p2,x2), dot(p3,x3) ) );\n  }\n\n    float hue2rgb(float f1, float f2, float hue) {\n    if (hue < 0.0)\n        hue += 1.0;\n    else if (hue > 1.0)\n        hue -= 1.0;\n    float res;\n    if ((6.0 * hue) < 1.0)\n        res = f1 + (f2 - f1) * 6.0 * hue;\n    else if ((2.0 * hue) < 1.0)\n        res = f2;\n    else if ((3.0 * hue) < 2.0)\n        res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;\n    else\n        res = f1;\n    return res;\n}\n\nvec3 hsl2rgb(vec3 hsl) {\n    vec3 rgb;\n    \n    if (hsl.y == 0.0) {\n        rgb = vec3(hsl.z); // Luminance\n    } else {\n        float f2;\n        \n        if (hsl.z < 0.5)\n            f2 = hsl.z * (1.0 + hsl.y);\n        else\n            f2 = hsl.z + hsl.y - hsl.y * hsl.z;\n            \n        float f1 = 2.0 * hsl.z - f2;\n        \n        rgb.r = hue2rgb(f1, f2, hsl.x + (1.0/3.0));\n        rgb.g = hue2rgb(f1, f2, hsl.x);\n        rgb.b = hue2rgb(f1, f2, hsl.x - (1.0/3.0));\n    }   \n    return rgb;\n}\n\nvec3 hsl2rgb(float h, float s, float l) {\n    return hsl2rgb(vec3(h, s, l));\n}\n\n    uniform float groundMaxElevation;\n    uniform vec3 lightDir;\n    uniform float tick;\n    uniform float ambientLightAmount;\n    uniform float diffusedLightAmount;\n\n    varying vec4 vPosition;\n    varying vec3 vNormal;\n\n    float random ( vec2 st ) {\n      return fract(\n        sin(\n          dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123\n        )\n      );\n    }\n\n    void main () {\n      vec3 color = vec3(1,0.8,1);\n      vec3 ambient = ambientLightAmount * color;\n      float percentElevation = vPosition.z/groundMaxElevation;\n      if (vPosition.w == 0.0) {\n        color = vec3(0,0,1.0);\n        float z = snoise(vec3(vPosition.x, vPosition.y, tick/200.0));\n        percentElevation = z/1.0 * 0.5 + 0.5;\n      }\n      else {\n        float cosTheta = dot(vNormal, normalize(lightDir));\n        // percentElevation = cosTheta;\n        // percentElevation = max(0.0, cosTheta);\n        // percentElevation = vPosition.z/groundMaxElevation;\n        // percentElevation = cosTheta * (vPosition.z/vPosition.w);\n        // percentElevation = vPosition.z/groundMaxElevation * cosTheta + 0.2;\n        percentElevation = vPosition.z/groundMaxElevation * max(0.0, cosTheta) + 0.2;\n      }\n      float clampedPercentElevation = clamp(percentElevation, 0.0, 1.0);\n      float elevationThreshold = clampedPercentElevation - 0.00;\n      vec3 diffuse = diffusedLightAmount * color * clampedPercentElevation;\n      // float randomThreshold = sqrt(random(vec2(random(vPosition.xy), vPosition.zw)));\n      float randomThreshold = sqrt(random(vec2(random(vPosition.xy), vec2(clampedPercentElevation))));\n      // float randomThreshold = sqrt(random(vec2(clampedPercentElevation)));\n      // float randomThreshold = sqrt(random(vPosition.xy));\n      // float randomThreshold = sqrt(random(vec2(vPosition.zz)));\n      vec3 baseColor = ambient + diffuse;\n      // vec3 baseColorForCell = ambient + diffuseForCell;\n      // vec3 baseColor = vec3(clampedPercentElevation);\n      // if (randomThreshold < elevationThresholdForCell) {\n      if (randomThreshold < elevationThreshold) {\n        // gl_FragColor = vec4(1,0,1, 1);\n        gl_FragColor = vec4(baseColor + vec3(clampedPercentElevation), 1);\n        // gl_FragColor = vec4(baseColorForCell + vec3(clampedPercentElevation), 1);\n      }\n      else {\n        gl_FragColor = vec4(baseColor, 1);\n        // gl_FragColor = vec4(baseColorForCell, 1);\n      }\n    }\n  "]),
  attributes: {
    position: map.prop('positions'),
    normal: map.prop('normals'),
  },
  uniforms: {
    groundMaxElevation: map.prop('maxElevation'),
    zindex: map.prop('zindex'),
    lightDir: ({ tick }) => {
      // lightDir[0] = Math.sin(tick/100)
      // return lightDir
      const lightSource = [1,1,1]
      // return lightSource
      const rotated = vec3.rotateY([], lightSource, [0,0,0], tick/40)
      return rotated
    },
    tick: ({ tick }) => tick,
    ambientLightAmount: 0.3,
    diffusedLightAmount: 0.7,
    aspect: ({ viewportWidth, viewportHeight }) => {
      return viewportWidth/viewportHeight
    },
  },
  elements: map.prop('cells'),
})

const manifestImg = [
  '8-80-112.pngraw',
  '8-80-113.pngraw',
  '8-80-114.pngraw',
  '8-80-115.pngraw',
  '8-81-112.pngraw',
  '8-81-113.pngraw',
  '8-81-114.pngraw',
  '8-81-115.pngraw',
]
const tileQuads = {
  positions: [],
  cells: [],
  zindex: 50,
  color: [0,1,0],
}
const tilesImg = {}
manifestImg.forEach((file, id) => {
  const zTile = file.split('.')[0].split('-').map(Number)
  const tile = [zTile[1], zTile[2], zTile[0]]
  const geojson = tilebelt.tileToGeoJSON(tile)
  const bounds = geojson.coordinates[0] // [nw, sw, se, ne, nw]
  const bbox = [bounds[0][0], bounds[1][1], bounds[2][0], bounds[0][1]]
  // bbox for box intersections
  // [w,s,e,n]
  tilesImg[`${id}!${file}`] = bbox

  const head = tileQuads.positions.length
  tileQuads.cells.push([head+2, head+1, head])
  tileQuads.cells.push([head, head+3, head+2])
  tileQuads.positions = tileQuads.positions.concat(bounds.slice(0, 4))
})

function addTile ({ key, bbox }) {
  const id = key.split('!')[0]
  const file = key.split('!')[1]
  const level = Number(file.split('-')[0])
  resl({
    manifest: { tile: { type: 'image', src: `terrain-rgb/${file}` } },
    onDone: ({ tile }) => {
      map.draw()

      const pixels = pixelsFromImg(tile)
      const mesh = terrainImgToMesh({ pixels, sampleRate, bbox })
      const propMesh = {
        id,
        key,
        zindex: 3 + level,
      }
      propMesh.maxElevation = maxElevation = Math.max(maxElevation, mesh.maxElevation)
      propMesh.positions = mesh.positions
      propMesh.cells = mesh.cells
      propMesh.normals = mesh.normals
      drawTerrainMeshTile.props.push(propMesh)
      map.draw()
    },
  })
}

function removeTile ({ key, bbox }) {
  drawTerrainImgTile.props = drawTerrainImgTile.props.filter((p) => {
    return p.key !== key
  })
}

// tile image layer
let maxElevation = 0.1
const forceLoadAllTiles = true
if (forceLoadAllTiles) {
  const tilesToLoad = [
    {
      key: "2!8-80-114.pngraw",
      bbox: [-67.5, 17.97873309555615, -66.09375, 19.311143355064647]
    },
    {
      key: "3!8-80-115.pngraw",
      bbox: [-67.5, 16.63619187839765, -66.09375, 17.97873309555615]},
    {
      key: "6!8-81-114.pngraw", 
      bbox: [-66.09375, 17.97873309555615, -64.6875, 19.311143355064647]},
    {
      key: "7!8-81-115.pngraw", 
      bbox: [-66.09375, 16.63619187839765, -64.6875, 17.97873309555615]},
    {
      key: "1!8-80-113.pngraw", 
      bbox: [-67.5, 19.311143355064647, -66.09375, 20.632784250388028]},
    {
      key: "5!8-81-113.pngraw", 
      bbox: [-66.09375, 19.311143355064647, -64.6875, 20.632784250388028]},
  ]
  tilesToLoad.forEach(addTile)
}
else {
  map.addLayer({
    viewbox: (bbox, zoom, cb) => {
      cb(null, tilesImg)
    },
    add: function (key, bbox) {
      addTile({ key, bbox })
    },
    remove: (key, bbox) => {
      removeTile({ key, bbox })
    },
  })
}

function pixelsFromImg (img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const context = canvas.getContext('2d')
  context.drawImage(img, 0, 0)
  const pixels = context.getImageData(0, 0, img.width, img.height)
  return ndarray(new Uint8Array(pixels.data), [img.width, img.height, 4], [4, 4*img.width, 1], 0)
}

map.regl.frame(() => {
  map.draw() 
})

},{"./terrain-img-to-mesh.js":98,"@mapbox/tilebelt":2,"earth-mesh":23,"gl-vec3":42,"glslify":72,"mixmap":79,"ndarray":89,"regl":94,"resl":95}],2:[function(require,module,exports){
'use strict';

var d2r = Math.PI / 180,
    r2d = 180 / Math.PI;

/**
 * Get the bbox of a tile
 *
 * @name tileToBBOX
 * @param {Array<number>} tile
 * @returns {Array<number>} bbox
 * @example
 * var bbox = tileToBBOX([5, 10, 10])
 * //=bbox
 */
function tileToBBOX(tile) {
    var e = tile2lon(tile[0] + 1, tile[2]);
    var w = tile2lon(tile[0], tile[2]);
    var s = tile2lat(tile[1] + 1, tile[2]);
    var n = tile2lat(tile[1], tile[2]);
    return [w, s, e, n];
}

/**
 * Get a geojson representation of a tile
 *
 * @name tileToGeoJSON
 * @param {Array<number>} tile
 * @returns {Feature<Polygon>}
 * @example
 * var poly = tileToGeoJSON([5, 10, 10])
 * //=poly
 */
function tileToGeoJSON(tile) {
    var bbox = tileToBBOX(tile);
    var poly = {
        type: 'Polygon',
        coordinates: [[
            [bbox[0], bbox[3]],
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[2], bbox[3]],
            [bbox[0], bbox[3]]
        ]]
    };
    return poly;
}

function tile2lon(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
}

function tile2lat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Get the tile for a point at a specified zoom level
 *
 * @name pointToTile
 * @param {number} lon
 * @param {number} lat
 * @param {number} z
 * @returns {Array<number>} tile
 * @example
 * var tile = pointToTile(1, 1, 20)
 * //=tile
 */
function pointToTile(lon, lat, z) {
    var tile = pointToTileFraction(lon, lat, z);
    tile[0] = Math.floor(tile[0]);
    tile[1] = Math.floor(tile[1]);
    return tile;
}

/**
 * Get the 4 tiles one zoom level higher
 *
 * @name getChildren
 * @param {Array<number>} tile
 * @returns {Array<Array<number>>} tiles
 * @example
 * var tiles = getChildren([5, 10, 10])
 * //=tiles
 */
function getChildren(tile) {
    return [
        [tile[0] * 2, tile[1] * 2, tile[2] + 1],
        [tile[0] * 2 + 1, tile[1] * 2, tile[2 ] + 1],
        [tile[0] * 2 + 1, tile[1] * 2 + 1, tile[2] + 1],
        [tile[0] * 2, tile[1] * 2 + 1, tile[2] + 1]
    ];
}

/**
 * Get the tile one zoom level lower
 *
 * @name getParent
 * @param {Array<number>} tile
 * @returns {Array<number>} tile
 * @example
 * var tile = getParent([5, 10, 10])
 * //=tile
 */
function getParent(tile) {
    return [tile[0] >> 1, tile[1] >> 1, tile[2] - 1];
}

function getSiblings(tile) {
    return getChildren(getParent(tile));
}

/**
 * Get the 3 sibling tiles for a tile
 *
 * @name getSiblings
 * @param {Array<number>} tile
 * @returns {Array<Array<number>>} tiles
 * @example
 * var tiles = getSiblings([5, 10, 10])
 * //=tiles
 */
function hasSiblings(tile, tiles) {
    var siblings = getSiblings(tile);
    for (var i = 0; i < siblings.length; i++) {
        if (!hasTile(tiles, siblings[i])) return false;
    }
    return true;
}

/**
 * Check to see if an array of tiles contains a particular tile
 *
 * @name hasTile
 * @param {Array<Array<number>>} tiles
 * @param {Array<number>} tile
 * @returns {boolean}
 * @example
 * var tiles = [
 *     [0, 0, 5],
 *     [0, 1, 5],
 *     [1, 1, 5],
 *     [1, 0, 5]
 * ]
 * hasTile(tiles, [0, 0, 5])
 * //=boolean
 */
function hasTile(tiles, tile) {
    for (var i = 0; i < tiles.length; i++) {
        if (tilesEqual(tiles[i], tile)) return true;
    }
    return false;
}

/**
 * Check to see if two tiles are the same
 *
 * @name tilesEqual
 * @param {Array<number>} tile1
 * @param {Array<number>} tile2
 * @returns {boolean}
 * @example
 * tilesEqual([0, 1, 5], [0, 0, 5])
 * //=boolean
 */
function tilesEqual(tile1, tile2) {
    return (
        tile1[0] === tile2[0] &&
        tile1[1] === tile2[1] &&
        tile1[2] === tile2[2]
    );
}

/**
 * Get the quadkey for a tile
 *
 * @name tileToQuadkey
 * @param {Array<number>} tile
 * @returns {string} quadkey
 * @example
 * var quadkey = tileToQuadkey([0, 1, 5])
 * //=quadkey
 */
function tileToQuadkey(tile) {
    var index = '';
    for (var z = tile[2]; z > 0; z--) {
        var b = 0;
        var mask = 1 << (z - 1);
        if ((tile[0] & mask) !== 0) b++;
        if ((tile[1] & mask) !== 0) b += 2;
        index += b.toString();
    }
    return index;
}

/**
 * Get the tile for a quadkey
 *
 * @name quadkeyToTile
 * @param {string} quadkey
 * @returns {Array<number>} tile
 * @example
 * var tile = quadkeyToTile('00001033')
 * //=tile
 */
function quadkeyToTile(quadkey) {
    var x = 0;
    var y = 0;
    var z = quadkey.length;

    for (var i = z; i > 0; i--) {
        var mask = 1 << (i - 1);
        var q = +quadkey[z - i];
        if (q === 1) x |= mask;
        if (q === 2) y |= mask;
        if (q === 3) {
            x |= mask;
            y |= mask;
        }
    }
    return [x, y, z];
}

/**
 * Get the smallest tile to cover a bbox
 *
 * @name bboxToTile
 * @param {Array<number>} bbox
 * @returns {Array<number>} tile
 * @example
 * var tile = bboxToTile([ -178, 84, -177, 85 ])
 * //=tile
 */
function bboxToTile(bboxCoords) {
    var min = pointToTile(bboxCoords[0], bboxCoords[1], 32);
    var max = pointToTile(bboxCoords[2], bboxCoords[3], 32);
    var bbox = [min[0], min[1], max[0], max[1]];

    var z = getBboxZoom(bbox);
    if (z === 0) return [0, 0, 0];
    var x = bbox[0] >>> (32 - z);
    var y = bbox[1] >>> (32 - z);
    return [x, y, z];
}

function getBboxZoom(bbox) {
    var MAX_ZOOM = 28;
    for (var z = 0; z < MAX_ZOOM; z++) {
        var mask = 1 << (32 - (z + 1));
        if (((bbox[0] & mask) !== (bbox[2] & mask)) ||
            ((bbox[1] & mask) !== (bbox[3] & mask))) {
            return z;
        }
    }

    return MAX_ZOOM;
}

/**
 * Get the precise fractional tile location for a point at a zoom level
 *
 * @name pointToTileFraction
 * @param {number} lon
 * @param {number} lat
 * @param {number} z
 * @returns {Array<number>} tile fraction
 * var tile = pointToTileFraction(30.5, 50.5, 15)
 * //=tile
 */
function pointToTileFraction(lon, lat, z) {
    var sin = Math.sin(lat * d2r),
        z2 = Math.pow(2, z),
        x = z2 * (lon / 360 + 0.5),
        y = z2 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);

    // Wrap Tile X
    x = x % z2;
    if (x < 0) x = x + z2;
    return [x, y, z];
}

module.exports = {
    tileToGeoJSON: tileToGeoJSON,
    tileToBBOX: tileToBBOX,
    getChildren: getChildren,
    getParent: getParent,
    getSiblings: getSiblings,
    hasTile: hasTile,
    hasSiblings: hasSiblings,
    tilesEqual: tilesEqual,
    tileToQuadkey: tileToQuadkey,
    quadkeyToTile: quadkeyToTile,
    pointToTile: pointToTile,
    bboxToTile: bboxToTile,
    pointToTileFraction: pointToTileFraction
};

},{}],3:[function(require,module,exports){
'use strict'

module.exports = angleNormals

function hypot(x, y, z) {
  return Math.sqrt(Math.pow(x,2) + Math.pow(y,2) + Math.pow(z,2))
}

function weight(s, r, a) {
  return Math.atan2(r, (s - a))
}

function mulAdd(dest, s, x, y, z) {
  dest[0] += s * x
  dest[1] += s * y
  dest[2] += s * z
}

function angleNormals(cells, positions) {
  var numVerts = positions.length
  var numCells = cells.length

  //Allocate normal array
  var normals = new Array(numVerts)
  for(var i=0; i<numVerts; ++i) {
    normals[i] = [0,0,0]
  }

  //Scan cells, and
  for(var i=0; i<numCells; ++i) {
    var cell = cells[i]
    var a = positions[cell[0]]
    var b = positions[cell[1]]
    var c = positions[cell[2]]

    var abx = a[0] - b[0]
    var aby = a[1] - b[1]
    var abz = a[2] - b[2]
    var ab = hypot(abx, aby, abz)

    var bcx = b[0] - c[0]
    var bcy = b[1] - c[1]
    var bcz = b[2] - c[2]
    var bc = hypot(bcx, bcy, bcz)

    var cax = c[0] - a[0]
    var cay = c[1] - a[1]
    var caz = c[2] - a[2]
    var ca = hypot(cax, cay, caz)

    if(Math.min(ab, bc, ca) < 1e-6) {
      continue
    }

    var s = 0.5 * (ab + bc + ca)
    var r = Math.sqrt((s - ab)*(s - bc)*(s - ca)/s)

    var nx = aby * bcz - abz * bcy
    var ny = abz * bcx - abx * bcz
    var nz = abx * bcy - aby * bcx
    var nl = hypot(nx, ny, nz)
    nx /= nl
    ny /= nl
    nz /= nl

    mulAdd(normals[cell[0]], weight(s, r, bc), nx, ny, nz)
    mulAdd(normals[cell[1]], weight(s, r, ca), nx, ny, nz)
    mulAdd(normals[cell[2]], weight(s, r, ab), nx, ny, nz)
  }

  //Normalize all the normals
  for(var i=0; i<numVerts; ++i) {
    var n = normals[i]
    var l = Math.sqrt(
      Math.pow(n[0], 2) +
      Math.pow(n[1], 2) +
      Math.pow(n[2], 2))
    if(l < 1e-8) {
      n[0] = 1
      n[1] = 0
      n[2] = 0
      continue
    }
    n[0] /= l
    n[1] /= l
    n[2] /= l
  }

  return normals
}

},{}],4:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],5:[function(require,module,exports){
var trailingNewlineRegex = /\n[\s]+$/
var leadingNewlineRegex = /^\n[\s]+/
var trailingSpaceRegex = /[\s]+$/
var leadingSpaceRegex = /^[\s]+/
var multiSpaceRegex = /[\n\s]+/g

var TEXT_TAGS = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i',
  'kbd', 'mark', 'q', 'rp', 'rt', 'rtc', 'ruby', 's', 'amp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
]

var VERBATIM_TAGS = [
  'code', 'pre', 'textarea'
]

module.exports = function appendChild (el, childs) {
  if (!Array.isArray(childs)) return

  var nodeName = el.nodeName.toLowerCase()

  var hadText = false
  var value, leader

  for (var i = 0, len = childs.length; i < len; i++) {
    var node = childs[i]
    if (Array.isArray(node)) {
      appendChild(el, node)
      continue
    }

    if (typeof node === 'number' ||
      typeof node === 'boolean' ||
      typeof node === 'function' ||
      node instanceof Date ||
      node instanceof RegExp) {
      node = node.toString()
    }

    var lastChild = el.childNodes[el.childNodes.length - 1]

    // Iterate over text nodes
    if (typeof node === 'string') {
      hadText = true

      // If we already had text, append to the existing text
      if (lastChild && lastChild.nodeName === '#text') {
        lastChild.nodeValue += node

      // We didn't have a text node yet, create one
      } else {
        node = document.createTextNode(node)
        el.appendChild(node)
        lastChild = node
      }

      // If this is the last of the child nodes, make sure we close it out
      // right
      if (i === len - 1) {
        hadText = false
        // Trim the child text nodes if the current node isn't a
        // node where whitespace matters.
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          // The very first node in the list should not have leading
          // whitespace. Sibling text nodes should have whitespace if there
          // was any.
          leader = i === 0 ? '' : ' '
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, leader)
            .replace(leadingSpaceRegex, ' ')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

    // Iterate over DOM nodes
    } else if (node && node.nodeType) {
      // If the last node was a text node, make sure it is properly closed out
      if (hadText) {
        hadText = false

        // Trim the child text nodes if the current node isn't a
        // text node or a code node
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')

          // Remove empty text nodes, append otherwise
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        // Trim the child nodes if the current node is not a node
        // where all whitespace must be preserved
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingSpaceRegex, ' ')
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

      // Store the last nodename
      var _nodeName = node.nodeName
      if (_nodeName) nodeName = _nodeName.toLowerCase()

      // Append the node to the DOM
      el.appendChild(node)
    }
  }
}

},{}],6:[function(require,module,exports){
var hyperx = require('hyperx')
var appendChild = require('./appendChild')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = [
  'autofocus', 'checked', 'defaultchecked', 'disabled', 'formnovalidate',
  'indeterminate', 'readonly', 'required', 'selected', 'willvalidate'
]

var COMMENT_TAG = '!--'

var SVG_TAGS = [
  'svg', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
  'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'filter',
  'font', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src',
  'font-face-uri', 'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image',
  'line', 'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph',
  'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else if (tag === COMMENT_TAG) {
    return document.createComment(props.comment)
  } else {
    el = document.createElement(tag)
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS.indexOf(key) !== -1) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  appendChild(el, children)
  return el
}

module.exports = hyperx(belCreateElement, {comments: true})
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"./appendChild":5,"hyperx":74}],7:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);
  
  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;
  
  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],8:[function(require,module,exports){
'use strict'

module.exports = boxIntersectWrapper

var pool = require('typedarray-pool')
var sweep = require('./lib/sweep')
var boxIntersectIter = require('./lib/intersect')

function boxEmpty(d, box) {
  for(var j=0; j<d; ++j) {
    if(!(box[j] <= box[j+d])) {
      return true
    }
  }
  return false
}

//Unpack boxes into a flat typed array, remove empty boxes
function convertBoxes(boxes, d, data, ids) {
  var ptr = 0
  var count = 0
  for(var i=0, n=boxes.length; i<n; ++i) {
    var b = boxes[i]
    if(boxEmpty(d, b)) {
      continue
    }
    for(var j=0; j<2*d; ++j) {
      data[ptr++] = b[j]
    }
    ids[count++] = i
  }
  return count
}

//Perform type conversions, check bounds
function boxIntersect(red, blue, visit, full) {
  var n = red.length
  var m = blue.length

  //If either array is empty, then we can skip this whole thing
  if(n <= 0 || m <= 0) {
    return
  }

  //Compute dimension, if it is 0 then we skip
  var d = (red[0].length)>>>1
  if(d <= 0) {
    return
  }

  var retval

  //Convert red boxes
  var redList  = pool.mallocDouble(2*d*n)
  var redIds   = pool.mallocInt32(n)
  n = convertBoxes(red, d, redList, redIds)

  if(n > 0) {
    if(d === 1 && full) {
      //Special case: 1d complete
      sweep.init(n)
      retval = sweep.sweepComplete(
        d, visit, 
        0, n, redList, redIds,
        0, n, redList, redIds)
    } else {

      //Convert blue boxes
      var blueList = pool.mallocDouble(2*d*m)
      var blueIds  = pool.mallocInt32(m)
      m = convertBoxes(blue, d, blueList, blueIds)

      if(m > 0) {
        sweep.init(n+m)

        if(d === 1) {
          //Special case: 1d bipartite
          retval = sweep.sweepBipartite(
            d, visit, 
            0, n, redList,  redIds,
            0, m, blueList, blueIds)
        } else {
          //General case:  d>1
          retval = boxIntersectIter(
            d, visit,    full,
            n, redList,  redIds,
            m, blueList, blueIds)
        }

        pool.free(blueList)
        pool.free(blueIds)
      }
    }

    pool.free(redList)
    pool.free(redIds)
  }

  return retval
}


var RESULT

function appendItem(i,j) {
  RESULT.push([i,j])
}

function intersectFullArray(x) {
  RESULT = []
  boxIntersect(x, x, appendItem, true)
  return RESULT
}

function intersectBipartiteArray(x, y) {
  RESULT = []
  boxIntersect(x, y, appendItem, false)
  return RESULT
}

//User-friendly wrapper, handle full input and no-visitor cases
function boxIntersectWrapper(arg0, arg1, arg2) {
  var result
  switch(arguments.length) {
    case 1:
      return intersectFullArray(arg0)
    case 2:
      if(typeof arg1 === 'function') {
        return boxIntersect(arg0, arg0, arg1, true)
      } else {
        return intersectBipartiteArray(arg0, arg1)
      }
    case 3:
      return boxIntersect(arg0, arg1, arg2, false)
    default:
      throw new Error('box-intersect: Invalid arguments')
  }
}
},{"./lib/intersect":10,"./lib/sweep":14,"typedarray-pool":97}],9:[function(require,module,exports){
'use strict'

var DIMENSION   = 'd'
var AXIS        = 'ax'
var VISIT       = 'vv'
var FLIP        = 'fp'

var ELEM_SIZE   = 'es'

var RED_START   = 'rs'
var RED_END     = 're'
var RED_BOXES   = 'rb'
var RED_INDEX   = 'ri'
var RED_PTR     = 'rp'

var BLUE_START  = 'bs'
var BLUE_END    = 'be'
var BLUE_BOXES  = 'bb'
var BLUE_INDEX  = 'bi'
var BLUE_PTR    = 'bp'

var RETVAL      = 'rv'

var INNER_LABEL = 'Q'

var ARGS = [
  DIMENSION,
  AXIS,
  VISIT,
  RED_START,
  RED_END,
  RED_BOXES,
  RED_INDEX,
  BLUE_START,
  BLUE_END,
  BLUE_BOXES,
  BLUE_INDEX
]

function generateBruteForce(redMajor, flip, full) {
  var funcName = 'bruteForce' + 
    (redMajor ? 'Red' : 'Blue') + 
    (flip ? 'Flip' : '') +
    (full ? 'Full' : '')

  var code = ['function ', funcName, '(', ARGS.join(), '){',
    'var ', ELEM_SIZE, '=2*', DIMENSION, ';']

  var redLoop = 
    'for(var i=' + RED_START + ',' + RED_PTR + '=' + ELEM_SIZE + '*' + RED_START + ';' +
        'i<' + RED_END +';' +
        '++i,' + RED_PTR + '+=' + ELEM_SIZE + '){' +
        'var x0=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '],' +
            'x1=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '+' + DIMENSION + '],' +
            'xi=' + RED_INDEX + '[i];'

  var blueLoop = 
    'for(var j=' + BLUE_START + ',' + BLUE_PTR + '=' + ELEM_SIZE + '*' + BLUE_START + ';' +
        'j<' + BLUE_END + ';' +
        '++j,' + BLUE_PTR + '+=' + ELEM_SIZE + '){' +
        'var y0=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '],' +
            (full ? 'y1=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '+' + DIMENSION + '],' : '') +
            'yi=' + BLUE_INDEX + '[j];'

  if(redMajor) {
    code.push(redLoop, INNER_LABEL, ':', blueLoop)
  } else {
    code.push(blueLoop, INNER_LABEL, ':', redLoop)
  }

  if(full) {
    code.push('if(y1<x0||x1<y0)continue;')
  } else if(flip) {
    code.push('if(y0<=x0||x1<y0)continue;')
  } else {
    code.push('if(y0<x0||x1<y0)continue;')
  }

  code.push('for(var k='+AXIS+'+1;k<'+DIMENSION+';++k){'+
    'var r0='+RED_BOXES+'[k+'+RED_PTR+'],'+
        'r1='+RED_BOXES+'[k+'+DIMENSION+'+'+RED_PTR+'],'+
        'b0='+BLUE_BOXES+'[k+'+BLUE_PTR+'],'+
        'b1='+BLUE_BOXES+'[k+'+DIMENSION+'+'+BLUE_PTR+'];'+
      'if(r1<b0||b1<r0)continue ' + INNER_LABEL + ';}' +
      'var ' + RETVAL + '=' + VISIT + '(')

  if(flip) {
    code.push('yi,xi')
  } else {
    code.push('xi,yi')
  }

  code.push(');if(' + RETVAL + '!==void 0)return ' + RETVAL + ';}}}')

  return {
    name: funcName, 
    code: code.join('')
  }
}

function bruteForcePlanner(full) {
  var funcName = 'bruteForce' + (full ? 'Full' : 'Partial')
  var prefix = []
  var fargs = ARGS.slice()
  if(!full) {
    fargs.splice(3, 0, FLIP)
  }

  var code = ['function ' + funcName + '(' + fargs.join() + '){']

  function invoke(redMajor, flip) {
    var res = generateBruteForce(redMajor, flip, full)
    prefix.push(res.code)
    code.push('return ' + res.name + '(' + ARGS.join() + ');')
  }

  code.push('if(' + RED_END + '-' + RED_START + '>' +
                    BLUE_END + '-' + BLUE_START + '){')

  if(full) {
    invoke(true, false)
    code.push('}else{')
    invoke(false, false)
  } else {
    code.push('if(' + FLIP + '){')
    invoke(true, true)
    code.push('}else{')
    invoke(true, false)
    code.push('}}else{if(' + FLIP + '){')
    invoke(false, true)
    code.push('}else{')
    invoke(false, false)
    code.push('}')
  }
  code.push('}}return ' + funcName)

  var codeStr = prefix.join('') + code.join('')
  var proc = new Function(codeStr)
  return proc()
}


exports.partial = bruteForcePlanner(false)
exports.full    = bruteForcePlanner(true)
},{}],10:[function(require,module,exports){
'use strict'

module.exports = boxIntersectIter

var pool = require('typedarray-pool')
var bits = require('bit-twiddle')
var bruteForce = require('./brute')
var bruteForcePartial = bruteForce.partial
var bruteForceFull = bruteForce.full
var sweep = require('./sweep')
var findMedian = require('./median')
var genPartition = require('./partition')

//Twiddle parameters
var BRUTE_FORCE_CUTOFF    = 128       //Cut off for brute force search
var SCAN_CUTOFF           = (1<<22)   //Cut off for two way scan
var SCAN_COMPLETE_CUTOFF  = (1<<22)  

//Partition functions
var partitionInteriorContainsInterval = genPartition(
  '!(lo>=p0)&&!(p1>=hi)', 
  ['p0', 'p1'])

var partitionStartEqual = genPartition(
  'lo===p0',
  ['p0'])

var partitionStartLessThan = genPartition(
  'lo<p0',
  ['p0'])

var partitionEndLessThanEqual = genPartition(
  'hi<=p0',
  ['p0'])

var partitionContainsPoint = genPartition(
  'lo<=p0&&p0<=hi',
  ['p0'])

var partitionContainsPointProper = genPartition(
  'lo<p0&&p0<=hi',
  ['p0'])

//Frame size for iterative loop
var IFRAME_SIZE = 6
var DFRAME_SIZE = 2

//Data for box statck
var INIT_CAPACITY = 1024
var BOX_ISTACK  = pool.mallocInt32(INIT_CAPACITY)
var BOX_DSTACK  = pool.mallocDouble(INIT_CAPACITY)

//Initialize iterative loop queue
function iterInit(d, count) {
  var levels = (8 * bits.log2(count+1) * (d+1))|0
  var maxInts = bits.nextPow2(IFRAME_SIZE*levels)
  if(BOX_ISTACK.length < maxInts) {
    pool.free(BOX_ISTACK)
    BOX_ISTACK = pool.mallocInt32(maxInts)
  }
  var maxDoubles = bits.nextPow2(DFRAME_SIZE*levels)
  if(BOX_DSTACK.length < maxDoubles) {
    pool.free(BOX_DSTACK)
    BOX_DSTACK = pool.mallocDouble(maxDoubles)
  }
}

//Append item to queue
function iterPush(ptr,
  axis, 
  redStart, redEnd, 
  blueStart, blueEnd, 
  state, 
  lo, hi) {

  var iptr = IFRAME_SIZE * ptr
  BOX_ISTACK[iptr]   = axis
  BOX_ISTACK[iptr+1] = redStart
  BOX_ISTACK[iptr+2] = redEnd
  BOX_ISTACK[iptr+3] = blueStart
  BOX_ISTACK[iptr+4] = blueEnd
  BOX_ISTACK[iptr+5] = state

  var dptr = DFRAME_SIZE * ptr
  BOX_DSTACK[dptr]   = lo
  BOX_DSTACK[dptr+1] = hi
}

//Special case:  Intersect single point with list of intervals
function onePointPartial(
  d, axis, visit, flip,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    if(flip && blueX === r0) {
      continue
    }
    var redId = redIndex[i]
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval
    if(flip) {
      retval = visit(blueId, redId)
    } else {
      retval = visit(redId, blueId)
    }
    if(retval !== void 0) {
      return retval
    }
  }
}

//Special case:  Intersect one point with list of intervals
function onePointFull(
  d, axis, visit,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var redId = redIndex[i]
    if(redId === blueId) {
      continue
    }
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval = visit(redId, blueId)
    if(retval !== void 0) {
      return retval
    }
  }
}

//The main box intersection routine
function boxIntersectIter(
  d, visit, initFull,
  xSize, xBoxes, xIndex,
  ySize, yBoxes, yIndex) {

  //Reserve memory for stack
  iterInit(d, xSize + ySize)

  var top  = 0
  var elemSize = 2 * d
  var retval

  iterPush(top++,
      0,
      0, xSize,
      0, ySize,
      initFull ? 16 : 0, 
      -Infinity, Infinity)
  if(!initFull) {
    iterPush(top++,
      0,
      0, ySize,
      0, xSize,
      1, 
      -Infinity, Infinity)
  }

  while(top > 0) {
    top  -= 1

    var iptr = top * IFRAME_SIZE
    var axis      = BOX_ISTACK[iptr]
    var redStart  = BOX_ISTACK[iptr+1]
    var redEnd    = BOX_ISTACK[iptr+2]
    var blueStart = BOX_ISTACK[iptr+3]
    var blueEnd   = BOX_ISTACK[iptr+4]
    var state     = BOX_ISTACK[iptr+5]

    var dptr = top * DFRAME_SIZE
    var lo        = BOX_DSTACK[dptr]
    var hi        = BOX_DSTACK[dptr+1]

    //Unpack state info
    var flip      = (state & 1)
    var full      = !!(state & 16)

    //Unpack indices
    var red       = xBoxes
    var redIndex  = xIndex
    var blue      = yBoxes
    var blueIndex = yIndex
    if(flip) {
      red         = yBoxes
      redIndex    = yIndex
      blue        = xBoxes
      blueIndex   = xIndex
    }

    if(state & 2) {
      redEnd = partitionStartLessThan(
        d, axis,
        redStart, redEnd, red, redIndex,
        hi)
      if(redStart >= redEnd) {
        continue
      }
    }
    if(state & 4) {
      redStart = partitionEndLessThanEqual(
        d, axis,
        redStart, redEnd, red, redIndex,
        lo)
      if(redStart >= redEnd) {
        continue
      }
    }
    
    var redCount  = redEnd  - redStart
    var blueCount = blueEnd - blueStart

    if(full) {
      if(d * redCount * (redCount + blueCount) < SCAN_COMPLETE_CUTOFF) {
        retval = sweep.scanComplete(
          d, axis, visit, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    } else {
      if(d * Math.min(redCount, blueCount) < BRUTE_FORCE_CUTOFF) {
        //If input small, then use brute force
        retval = bruteForcePartial(
            d, axis, visit, flip,
            redStart,  redEnd,  red,  redIndex,
            blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      } else if(d * redCount * blueCount < SCAN_CUTOFF) {
        //If input medium sized, then use sweep and prune
        retval = sweep.scanBipartite(
          d, axis, visit, flip, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    }
    
    //First, find all red intervals whose interior contains (lo,hi)
    var red0 = partitionInteriorContainsInterval(
      d, axis, 
      redStart, redEnd, red, redIndex,
      lo, hi)

    //Lower dimensional case
    if(redStart < red0) {

      if(d * (red0 - redStart) < BRUTE_FORCE_CUTOFF) {
        //Special case for small inputs: use brute force
        retval = bruteForceFull(
          d, axis+1, visit,
          redStart, red0, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
      } else if(axis === d-2) {
        if(flip) {
          retval = sweep.sweepBipartite(
            d, visit,
            blueStart, blueEnd, blue, blueIndex,
            redStart, red0, red, redIndex)
        } else {
          retval = sweep.sweepBipartite(
            d, visit,
            redStart, red0, red, redIndex,
            blueStart, blueEnd, blue, blueIndex)
        }
        if(retval !== void 0) {
          return retval
        }
      } else {
        iterPush(top++,
          axis+1,
          redStart, red0,
          blueStart, blueEnd,
          flip,
          -Infinity, Infinity)
        iterPush(top++,
          axis+1,
          blueStart, blueEnd,
          redStart, red0,
          flip^1,
          -Infinity, Infinity)
      }
    }

    //Divide and conquer phase
    if(red0 < redEnd) {

      //Cut blue into 3 parts:
      //
      //  Points < mid point
      //  Points = mid point
      //  Points > mid point
      //
      var blue0 = findMedian(
        d, axis, 
        blueStart, blueEnd, blue, blueIndex)
      var mid = blue[elemSize * blue0 + axis]
      var blue1 = partitionStartEqual(
        d, axis,
        blue0, blueEnd, blue, blueIndex,
        mid)

      //Right case
      if(blue1 < blueEnd) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blue1, blueEnd,
          (flip|4) + (full ? 16 : 0),
          mid, hi)
      }

      //Left case
      if(blueStart < blue0) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blueStart, blue0,
          (flip|2) + (full ? 16 : 0),
          lo, mid)
      }

      //Center case (the hard part)
      if(blue0 + 1 === blue1) {
        //Optimization: Range with exactly 1 point, use a brute force scan
        if(full) {
          retval = onePointFull(
            d, axis, visit,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        } else {
          retval = onePointPartial(
            d, axis, visit, flip,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        }
        if(retval !== void 0) {
          return retval
        }
      } else if(blue0 < blue1) {
        var red1
        if(full) {
          //If full intersection, need to handle special case
          red1 = partitionContainsPoint(
            d, axis,
            red0, redEnd, red, redIndex,
            mid)
          if(red0 < red1) {
            var redX = partitionStartEqual(
              d, axis,
              red0, red1, red, redIndex,
              mid)
            if(axis === d-2) {
              //Degenerate sweep intersection:
              //  [red0, redX] with [blue0, blue1]
              if(red0 < redX) {
                retval = sweep.sweepComplete(
                  d, visit,
                  red0, redX, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }

              //Normal sweep intersection:
              //  [redX, red1] with [blue0, blue1]
              if(redX < red1) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  redX, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }
            } else {
              if(red0 < redX) {
                iterPush(top++,
                  axis+1,
                  red0, redX,
                  blue0, blue1,
                  16,
                  -Infinity, Infinity)
              }
              if(redX < red1) {
                iterPush(top++,
                  axis+1,
                  redX, red1,
                  blue0, blue1,
                  0,
                  -Infinity, Infinity)
                iterPush(top++,
                  axis+1,
                  blue0, blue1,
                  redX, red1,
                  1,
                  -Infinity, Infinity)
              }
            }
          }
        } else {
          if(flip) {
            red1 = partitionContainsPointProper(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          } else {
            red1 = partitionContainsPoint(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          }
          if(red0 < red1) {
            if(axis === d-2) {
              if(flip) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  blue0, blue1, blue, blueIndex,
                  red0, red1, red, redIndex)
              } else {
                retval = sweep.sweepBipartite(
                  d, visit,
                  red0, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
              }
            } else {
              iterPush(top++,
                axis+1,
                red0, red1,
                blue0, blue1,
                flip,
                -Infinity, Infinity)
              iterPush(top++,
                axis+1,
                blue0, blue1,
                red0, red1,
                flip^1,
                -Infinity, Infinity)
            }
          }
        }
      }
    }
  }
}
},{"./brute":9,"./median":11,"./partition":12,"./sweep":14,"bit-twiddle":7,"typedarray-pool":97}],11:[function(require,module,exports){
'use strict'

module.exports = findMedian

var genPartition = require('./partition')

var partitionStartLessThan = genPartition('lo<p0', ['p0'])

var PARTITION_THRESHOLD = 8   //Cut off for using insertion sort in findMedian

//Base case for median finding:  Use insertion sort
function insertionSort(d, axis, start, end, boxes, ids) {
  var elemSize = 2 * d
  var boxPtr = elemSize * (start+1) + axis
  for(var i=start+1; i<end; ++i, boxPtr+=elemSize) {
    var x = boxes[boxPtr]
    for(var j=i, ptr=elemSize*(i-1); 
        j>start && boxes[ptr+axis] > x; 
        --j, ptr-=elemSize) {
      //Swap
      var aPtr = ptr
      var bPtr = ptr+elemSize
      for(var k=0; k<elemSize; ++k, ++aPtr, ++bPtr) {
        var y = boxes[aPtr]
        boxes[aPtr] = boxes[bPtr]
        boxes[bPtr] = y
      }
      var tmp = ids[j]
      ids[j] = ids[j-1]
      ids[j-1] = tmp
    }
  }
}

//Find median using quick select algorithm
//  takes O(n) time with high probability
function findMedian(d, axis, start, end, boxes, ids) {
  if(end <= start+1) {
    return start
  }

  var lo       = start
  var hi       = end
  var mid      = ((end + start) >>> 1)
  var elemSize = 2*d
  var pivot    = mid
  var value    = boxes[elemSize*mid+axis]
  
  while(lo < hi) {
    if(hi - lo < PARTITION_THRESHOLD) {
      insertionSort(d, axis, lo, hi, boxes, ids)
      value = boxes[elemSize*mid+axis]
      break
    }
    
    //Select pivot using median-of-3
    var count  = hi - lo
    var pivot0 = (Math.random()*count+lo)|0
    var value0 = boxes[elemSize*pivot0 + axis]
    var pivot1 = (Math.random()*count+lo)|0
    var value1 = boxes[elemSize*pivot1 + axis]
    var pivot2 = (Math.random()*count+lo)|0
    var value2 = boxes[elemSize*pivot2 + axis]
    if(value0 <= value1) {
      if(value2 >= value1) {
        pivot = pivot1
        value = value1
      } else if(value0 >= value2) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    } else {
      if(value1 >= value2) {
        pivot = pivot1
        value = value1
      } else if(value2 >= value0) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    }

    //Swap pivot to end of array
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Partition using pivot
    pivot = partitionStartLessThan(
      d, axis, 
      lo, hi-1, boxes, ids,
      value)

    //Swap pivot back
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Swap pivot to last pivot
    if(mid < pivot) {
      hi = pivot-1
      while(lo < hi && 
        boxes[elemSize*(hi-1)+axis] === value) {
        hi -= 1
      }
      hi += 1
    } else if(pivot < mid) {
      lo = pivot + 1
      while(lo < hi &&
        boxes[elemSize*lo+axis] === value) {
        lo += 1
      }
    } else {
      break
    }
  }

  //Make sure pivot is at start
  return partitionStartLessThan(
    d, axis, 
    start, mid, boxes, ids,
    boxes[elemSize*mid+axis])
}
},{"./partition":12}],12:[function(require,module,exports){
'use strict'

module.exports = genPartition

var code = 'for(var j=2*a,k=j*c,l=k,m=c,n=b,o=a+b,p=c;d>p;++p,k+=j){var _;if($)if(m===p)m+=1,l+=j;else{for(var s=0;j>s;++s){var t=e[k+s];e[k+s]=e[l],e[l++]=t}var u=f[p];f[p]=f[m],f[m++]=u}}return m'

function genPartition(predicate, args) {
  var fargs ='abcdef'.split('').concat(args)
  var reads = []
  if(predicate.indexOf('lo') >= 0) {
    reads.push('lo=e[k+n]')
  }
  if(predicate.indexOf('hi') >= 0) {
    reads.push('hi=e[k+o]')
  }
  fargs.push(
    code.replace('_', reads.join())
        .replace('$', predicate))
  return Function.apply(void 0, fargs)
}
},{}],13:[function(require,module,exports){
'use strict';

//This code is extracted from ndarray-sort
//It is inlined here as a temporary workaround

module.exports = wrapper;

var INSERT_SORT_CUTOFF = 32

function wrapper(data, n0) {
  if (n0 <= 4*INSERT_SORT_CUTOFF) {
    insertionSort(0, n0 - 1, data);
  } else {
    quickSort(0, n0 - 1, data);
  }
}

function insertionSort(left, right, data) {
  var ptr = 2*(left+1)
  for(var i=left+1; i<=right; ++i) {
    var a = data[ptr++]
    var b = data[ptr++]
    var j = i
    var jptr = ptr-2
    while(j-- > left) {
      var x = data[jptr-2]
      var y = data[jptr-1]
      if(x < a) {
        break
      } else if(x === a && y < b) {
        break
      }
      data[jptr]   = x
      data[jptr+1] = y
      jptr -= 2
    }
    data[jptr]   = a
    data[jptr+1] = b
  }
}

function swap(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = x
  data[j+1] = y
}

function move(i, j, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[i+1] = data[j+1]
}

function rotate(i, j, k, data) {
  i *= 2
  j *= 2
  k *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = data[k]
  data[j+1] = data[k+1]
  data[k] = x
  data[k+1] = y
}

function shufflePivot(i, j, px, py, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[j] = px
  data[i+1] = data[j+1]
  data[j+1] = py
}

function compare(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i],
      y = data[j]
  if(x < y) {
    return false
  } else if(x === y) {
    return data[i+1] > data[j+1]
  }
  return true
}

function comparePivot(i, y, b, data) {
  i *= 2
  var x = data[i]
  if(x < y) {
    return true
  } else if(x === y) {
    return data[i+1] < b
  }
  return false
}

function quickSort(left, right, data) {
  var sixth = (right - left + 1) / 6 | 0, 
      index1 = left + sixth, 
      index5 = right - sixth, 
      index3 = left + right >> 1, 
      index2 = index3 - sixth, 
      index4 = index3 + sixth, 
      el1 = index1, 
      el2 = index2, 
      el3 = index3, 
      el4 = index4, 
      el5 = index5, 
      less = left + 1, 
      great = right - 1, 
      tmp = 0
  if(compare(el1, el2, data)) {
    tmp = el1
    el1 = el2
    el2 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }
  if(compare(el1, el3, data)) {
    tmp = el1
    el1 = el3
    el3 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el1, el4, data)) {
    tmp = el1
    el1 = el4
    el4 = tmp
  }
  if(compare(el3, el4, data)) {
    tmp = el3
    el3 = el4
    el4 = tmp
  }
  if(compare(el2, el5, data)) {
    tmp = el2
    el2 = el5
    el5 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }

  var pivot1X = data[2*el2]
  var pivot1Y = data[2*el2+1]
  var pivot2X = data[2*el4]
  var pivot2Y = data[2*el4+1]

  var ptr0 = 2 * el1;
  var ptr2 = 2 * el3;
  var ptr4 = 2 * el5;
  var ptr5 = 2 * index1;
  var ptr6 = 2 * index3;
  var ptr7 = 2 * index5;
  for (var i1 = 0; i1 < 2; ++i1) {
    var x = data[ptr0+i1];
    var y = data[ptr2+i1];
    var z = data[ptr4+i1];
    data[ptr5+i1] = x;
    data[ptr6+i1] = y;
    data[ptr7+i1] = z;
  }

  move(index2, left, data)
  move(index4, right, data)
  for (var k = less; k <= great; ++k) {
    if (comparePivot(k, pivot1X, pivot1Y, data)) {
      if (k !== less) {
        swap(k, less, data)
      }
      ++less;
    } else {
      if (!comparePivot(k, pivot2X, pivot2Y, data)) {
        while (true) {
          if (!comparePivot(great, pivot2X, pivot2Y, data)) {
            if (--great < k) {
              break;
            }
            continue;
          } else {
            if (comparePivot(great, pivot1X, pivot1Y, data)) {
              rotate(k, less, great, data)
              ++less;
              --great;
            } else {
              swap(k, great, data)
              --great;
            }
            break;
          }
        }
      }
    }
  }
  shufflePivot(left, less-1, pivot1X, pivot1Y, data)
  shufflePivot(right, great+1, pivot2X, pivot2Y, data)
  if (less - 2 - left <= INSERT_SORT_CUTOFF) {
    insertionSort(left, less - 2, data);
  } else {
    quickSort(left, less - 2, data);
  }
  if (right - (great + 2) <= INSERT_SORT_CUTOFF) {
    insertionSort(great + 2, right, data);
  } else {
    quickSort(great + 2, right, data);
  }
  if (great - less <= INSERT_SORT_CUTOFF) {
    insertionSort(less, great, data);
  } else {
    quickSort(less, great, data);
  }
}
},{}],14:[function(require,module,exports){
'use strict'

module.exports = {
  init:           sqInit,
  sweepBipartite: sweepBipartite,
  sweepComplete:  sweepComplete,
  scanBipartite:  scanBipartite,
  scanComplete:   scanComplete
}

var pool  = require('typedarray-pool')
var bits  = require('bit-twiddle')
var isort = require('./sort')

//Flag for blue
var BLUE_FLAG = (1<<28)

//1D sweep event queue stuff (use pool to save space)
var INIT_CAPACITY      = 1024
var RED_SWEEP_QUEUE    = pool.mallocInt32(INIT_CAPACITY)
var RED_SWEEP_INDEX    = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_QUEUE   = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_INDEX   = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_QUEUE = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_INDEX = pool.mallocInt32(INIT_CAPACITY)
var SWEEP_EVENTS       = pool.mallocDouble(INIT_CAPACITY * 8)

//Reserves memory for the 1D sweep data structures
function sqInit(count) {
  var rcount = bits.nextPow2(count)
  if(RED_SWEEP_QUEUE.length < rcount) {
    pool.free(RED_SWEEP_QUEUE)
    RED_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(RED_SWEEP_INDEX.length < rcount) {
    pool.free(RED_SWEEP_INDEX)
    RED_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_QUEUE.length < rcount) {
    pool.free(BLUE_SWEEP_QUEUE)
    BLUE_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_INDEX.length < rcount) {
    pool.free(BLUE_SWEEP_INDEX)
    BLUE_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_QUEUE.length < rcount) {
    pool.free(COMMON_SWEEP_QUEUE)
    COMMON_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_INDEX.length < rcount) {
    pool.free(COMMON_SWEEP_INDEX)
    COMMON_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  var eventLength = 8 * rcount
  if(SWEEP_EVENTS.length < eventLength) {
    pool.free(SWEEP_EVENTS)
    SWEEP_EVENTS = pool.mallocDouble(eventLength)
  }
}

//Remove an item from the active queue in O(1)
function sqPop(queue, index, count, item) {
  var idx = index[item]
  var top = queue[count-1]
  queue[idx] = top
  index[top] = idx
}

//Insert an item into the active queue in O(1)
function sqPush(queue, index, count, item) {
  queue[count] = item
  index[item]  = count
}

//Recursion base case: use 1D sweep algorithm
function sweepBipartite(
    d, visit,
    redStart,  redEnd, red, redIndex,
    blueStart, blueEnd, blue, blueIndex) {

  //store events as pairs [coordinate, idx]
  //
  //  red create:  -(idx+1)
  //  red destroy: idx
  //  blue create: -(idx+BLUE_FLAG)
  //  blue destroy: idx+BLUE_FLAG
  //
  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = redIndex[i]
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -(idx+1)
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = blueIndex[i]+BLUE_FLAG
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive  = 0
  var blueActive = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e >= BLUE_FLAG) {
      //blue destroy event
      e = (e-BLUE_FLAG)|0
      sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, e)
    } else if(e >= 0) {
      //red destroy event
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e)
    } else if(e <= -BLUE_FLAG) {
      //blue create event
      e = (-e-BLUE_FLAG)|0
      for(var j=0; j<redActive; ++j) {
        var retval = visit(RED_SWEEP_QUEUE[j], e)
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, e)
    } else {
      //red create event
      e = (-e-1)|0
      for(var j=0; j<blueActive; ++j) {
        var retval = visit(e, BLUE_SWEEP_QUEUE[j])
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, e)
    }
  }
}

//Complete sweep
function sweepComplete(d, visit, 
  redStart, redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = (redIndex[i]+1)<<1
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = (blueIndex[i]+1)<<1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = (-idx)|1
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx|1
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  var blueActive   = 0
  var commonActive = 0
  for(var i=0; i<n; ++i) {
    var e     = SWEEP_EVENTS[2*i+1]|0
    var color = e&1
    if(i < n-1 && (e>>1) === (SWEEP_EVENTS[2*i+3]>>1)) {
      color = 2
      i += 1
    }
    
    if(e < 0) {
      //Create event
      var id = -(e>>1) - 1

      //Intersect with common
      for(var j=0; j<commonActive; ++j) {
        var retval = visit(COMMON_SWEEP_QUEUE[j], id)
        if(retval !== void 0) {
          return retval
        }
      }

      if(color !== 0) {
        //Intersect with red
        for(var j=0; j<redActive; ++j) {
          var retval = visit(RED_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color !== 1) {
        //Intersect with blue
        for(var j=0; j<blueActive; ++j) {
          var retval = visit(BLUE_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color === 0) {
        //Red
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, id)
      } else if(color === 1) {
        //Blue
        sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, id)
      } else if(color === 2) {
        //Both
        sqPush(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive++, id)
      }
    } else {
      //Destroy event
      var id = (e>>1) - 1
      if(color === 0) {
        //Red
        sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, id)
      } else if(color === 1) {
        //Blue
        sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, id)
      } else if(color === 2) {
        //Both
        sqPop(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive--, id)
      }
    }
  }
}

//Sweep and prune/scanline algorithm:
//  Scan along axis, detect intersections
//  Brute force all boxes along axis
function scanBipartite(
  d, axis, visit, flip,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {
  
  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  var redShift  = 1
  var blueShift = 1
  if(flip) {
    blueShift = BLUE_FLAG
  } else {
    redShift  = BLUE_FLAG
  }

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + redShift
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + blueShift
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      var isRed = false
      if(idx >= BLUE_FLAG) {
        isRed = !flip
        idx -= BLUE_FLAG 
      } else {
        isRed = !!flip
        idx -= 1
      }
      if(isRed) {
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, idx)
      } else {
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx
        
        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redPtr = elemSize * oidx

          if(b1 < red[redPtr+axis+1] || 
             red[redPtr+axis+1+d] < b0) {
            continue
          }

          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d] < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var redId  = redIndex[oidx]
          var retval
          if(flip) {
            retval = visit(blueId, redId)
          } else {
            retval = visit(redId, blueId)
          }
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e - redShift)
    }
  }
}

function scanComplete(
  d, axis, visit,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + BLUE_FLAG
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + 1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      if(idx >= BLUE_FLAG) {
        RED_SWEEP_QUEUE[redActive++] = idx - BLUE_FLAG
      } else {
        idx -= 1
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx

        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redId  = redIndex[oidx]

          if(redId === blueId) {
            break
          }

          var redPtr = elemSize * oidx
          if(b1 < red[redPtr+axis+1] || 
            red[redPtr+axis+1+d] < b0) {
            continue
          }
          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d]   < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var retval = visit(redId, blueId)
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      var idx = e - BLUE_FLAG
      for(var j=redActive-1; j>=0; --j) {
        if(RED_SWEEP_QUEUE[j] === idx) {
          for(var k=j+1; k<redActive; ++k) {
            RED_SWEEP_QUEUE[k-1] = RED_SWEEP_QUEUE[k]
          }
          break
        }
      }
      --redActive
    }
  }
}
},{"./sort":13,"bit-twiddle":7,"typedarray-pool":97}],15:[function(require,module,exports){

},{}],16:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],17:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":4,"buffer":17,"ieee754":75}],18:[function(require,module,exports){
var document = require('global/document')
var morph = require('nanomorph')

module.exports = CacheComponent

function makeId () {
  return 'cc-' + Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
}

function CacheComponent () {
  this._hasWindow = typeof window !== 'undefined'
  this._proxy = null
  this._args = null
  this._ccId = null
  this._id = null

  var self = this

  Object.defineProperty(this, '_element', {
    get: function () {
      var el = document.getElementById(self._id)
      if (el) return el.dataset.cacheComponent === self._ccId ? el : undefined
    }
  })
}

CacheComponent.prototype.render = function () {
  var args = new Array(arguments.length)
  var self = this
  var el
  for (var i = 0; i < arguments.length; i++) args[i] = arguments[i]
  if (!this._hasWindow) {
    return this._render.apply(this, args)
  } else if (this._element) {
    var shouldUpdate = this._update.apply(this, args)
    if (shouldUpdate) {
      this._args = args
      this._proxy = null
      el = this._brandNode(this._handleId(this._render.apply(this, args)))
      if (this._willUpdate) this._willUpdate()
      morph(this._element, el)
      if (this._didUpdate) window.requestAnimationFrame(function () { self._didUpdate() })
    }
    if (!this._proxy) { this._proxy = this._createProxy() }
    return this._proxy
  } else {
    this._ccId = makeId()
    this._args = args
    this._proxy = null
    el = this._brandNode(this._handleId(this._render.apply(this, args)))
    if (this._willMount) this._willMount(el)
    if (this._didMount) window.requestAnimationFrame(function () { self._didMount(el) })
    return el
  }
}

CacheComponent.prototype._createProxy = function () {
  var proxy = document.createElement('div')
  var self = this
  this._brandNode(proxy)
  proxy.id = this._id
  proxy.isSameNode = function (el) {
    return (el && el.dataset.cacheComponent === self._ccId)
  }
  return proxy
}

CacheComponent.prototype._brandNode = function (node) {
  node.setAttribute('data-cache-component', this._ccId)
  return node
}

CacheComponent.prototype._handleId = function (node) {
  if (node.id) {
    this._id = node.id
  } else {
    node.id = this._id = this._ccId
  }
  return node
}

CacheComponent.prototype._render = function () {
  throw new Error('cache-component: _render should be implemented!')
}

CacheComponent.prototype._update = function () {
  var length = arguments.length
  if (length !== this._args.length) return true

  for (var i = 0; i < length; i++) {
    if (arguments[i] !== this._args[i]) return true
  }
  return false
}

},{"global/document":70,"nanomorph":86}],19:[function(require,module,exports){
module.exports = function () {
  var regl = null
  var queue = []
  var def = dfn('()')
  unset()
  def.setRegl = function (r) {
    regl = r
    if (!r) return unset()
    for (var i = 0; i < queue.length; i++) {
      queue[i](regl)
    }
    queue = null
    def.frame = r.frame
    def.draw = r.draw
    def.poll = r.poll
    def.clear = r.clear
    def.buffer = r.buffer
    def.texture = r.texture
    def.elements = r.elements
    def.framebuffer = r.framebuffer
    def.framebufferCube = r.framebufferCube
    def.renderbuffer = r.renderbuffer
    def.cube = r.cube
    def.read = r.read
    def.hasExtension = r.hasExtension
    def.limits = r.limits
    def.stats = r.limits
    def.now = r.now
    def.destroy = r.destroy
    def.on = r.on
  }
  return def

  function unset () {
    if (!queue) queue = []
    def.frame = function (cb) { queue.push(function (r) { r.frame(cb) }) }
    def.draw = function (cb) { queue.push(function (r) { r.draw(cb) }) }
    def.poll = function () { queue.push(function (r) { r.poll() }) }
    def.clear = function (opts) { queue.push(function (r) { r.clear(opts) }) }
    def.prop = function (key) {
      return function (context, props) {
        if (!falsy(props[key])) {
          return props[key]
        } else {
          // missing key could be speical case unrolled uniform prop
          // https://github.com/regl-project/regl/issues/258
          // https://github.com/regl-project/regl/issues/373
          var matches = key.match(/(?<prop>.+)\[(?<index>.+)\]/i)
          if (matches) {
            return props[matches.groups.prop][matches.groups.index]
          }
        }
      }
    }
    def.props = def.prop
    def.context = function (key) {
      return function (context, props) { return context[key] }
    }
    def['this'] = function (key) {
      return function (context, props) { return this[key] }
    }
    def.buffer = dfn('buffer')
    def.texture = dfn('texture')
    def.elements = dfn('elements')
    def.framebuffer = dfnx('framebuffer',['resize','use'])
    def.framebufferCube = dfn('framebufferCube')
    def.renderbuffer = dfn('renderbuffer')
    def.cube = dfn('cube')
    def.read = function () {}
    def.hasExtension = function () {}
    def.limits = function () {}
    def.stats = function () {}
    def.now = function () { return 0 }
    def.destroy = function () { queue.push(function (r) { r.destroy() }) }
    def.on = function (name, f) { queue.push(function (r) { r.on(name,f) }) }
  }
  function dfn (key) {
    return function (opts) {
      if (key === '()' && regl) return regl(opts)
      else if (regl) return regl[key](opts)

      var f = null
      if (key === '()') {
        queue.push(function (r) { f = r(opts) })
      } else {
        queue.push(function (r) { f = r[key](opts) })
      }
      return function () {
        var args = arguments
        if (!falsy(f)) {
          if (key === '()') f.apply(null,args)
          else return f
        } else {
          queue.push(function (r) { f.apply(null,args) })
        }
      }
    }
  }
  function dfnx (key, methods) {
    return function (opts) {
      if (key === '()' && regl) return regl(opts)
      else if (regl) return regl[key](opts)

      var f = null
      if (key === '()') {
        queue.push(function (r) { f = r(opts) })
      } else {
        queue.push(function (r) { f = r[key](opts) })
      }
      var r = function () {
        var args = arguments
        if (!falsy(f)) {
          if (key === '()') f.apply(null,args)
          else return f
        } else {
          queue.push(function (r) { f.apply(null,args) })
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var m = methods[i]
        r[m] = function () {
          var args = arguments
          if (!falsy(f)) return f[m].apply(f,args)
          else queue.push(function () { f[m].apply(f,args) })
        }
      }
      return r
    }
  }
}

function falsy (x) {
  return x === null || x === undefined
}

},{}],20:[function(require,module,exports){
'use strict';

module.exports = function defined() {
	for (var i = 0; i < arguments.length; i++) {
		if (typeof arguments[i] !== 'undefined') {
			return arguments[i];
		}
	}
};

},{}],21:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],22:[function(require,module,exports){
'use strict';

module.exports = earcut;
module.exports.default = earcut;

function earcut(data, holeIndices, dim) {

    dim = dim || 2;

    var hasHoles = holeIndices && holeIndices.length,
        outerLen = hasHoles ? holeIndices[0] * dim : data.length,
        outerNode = linkedList(data, 0, outerLen, dim, true),
        triangles = [];

    if (!outerNode || outerNode.next === outerNode.prev) return triangles;

    var minX, minY, maxX, maxY, x, y, invSize;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length > 80 * dim) {
        minX = maxX = data[0];
        minY = maxY = data[1];

        for (var i = dim; i < outerLen; i += dim) {
            x = data[i];
            y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // minX, minY and invSize are later used to transform coords into integers for z-order calculation
        invSize = Math.max(maxX - minX, maxY - minY);
        invSize = invSize !== 0 ? 32767 / invSize : 0;
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(data, start, end, dim, clockwise) {
    var i, last;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
        for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    return last;
}

// eliminate colinear or duplicate points
function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;

    var p = start,
        again;
    do {
        again = false;

        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            removeNode(p);
            p = end = p.prev;
            if (p === p.next) break;
            again = true;

        } else {
            p = p.next;
        }
    } while (again || p !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
            // cut off the triangle
            triangles.push(prev.i / dim | 0);
            triangles.push(ear.i / dim | 0);
            triangles.push(next.i / dim | 0);

            removeNode(ear);

            // skipping the next vertex leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering points and slicing again
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

            // if this didn't work, try curing all small self-intersections locally
            } else if (pass === 1) {
                ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
                earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

            // as a last resort, try splitting the remaining polygon into two
            } else if (pass === 2) {
                splitEarcut(ear, triangles, dim, minX, minY, invSize);
            }

            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear
    var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

    // triangle bbox; min & max are calculated like this for speed
    var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
        y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
        x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
        y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

    var p = c.next;
    while (p !== a) {
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
            pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }

    return true;
}

function isEarHashed(ear, minX, minY, invSize) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

    // triangle bbox; min & max are calculated like this for speed
    var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
        y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
        x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
        y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

    // z-order range for the current triangle bbox;
    var minZ = zOrder(x0, y0, minX, minY, invSize),
        maxZ = zOrder(x1, y1, minX, minY, invSize);

    var p = ear.prevZ,
        n = ear.nextZ;

    // look for points inside the triangle in both directions
    while (p && p.z >= minZ && n && n.z <= maxZ) {
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
            pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;

        if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
            pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    // look for remaining points in decreasing z-order
    while (p && p.z >= minZ) {
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
            pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;
    }

    // look for remaining points in increasing z-order
    while (n && n.z <= maxZ) {
        if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
            pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    return true;
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start, triangles, dim) {
    var p = start;
    do {
        var a = p.prev,
            b = p.next.next;

        if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

            triangles.push(a.i / dim | 0);
            triangles.push(p.i / dim | 0);
            triangles.push(b.i / dim | 0);

            // remove two nodes involved
            removeNode(p);
            removeNode(p.next);

            p = start = b;
        }
        p = p.next;
    } while (p !== start);

    return filterPoints(p);
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start, triangles, dim, minX, minY, invSize) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (a.i !== b.i && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
                earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
        i, len, start, end, list;

    for (i = 0, len = holeIndices.length; i < len; i++) {
        start = holeIndices[i] * dim;
        end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        list = linkedList(data, start, end, dim, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
    }

    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        outerNode = eliminateHole(queue[i], outerNode);
    }

    return outerNode;
}

function compareX(a, b) {
    return a.x - b.x;
}

// find a bridge between vertices that connects hole with an outer ring and and link it
function eliminateHole(hole, outerNode) {
    var bridge = findHoleBridge(hole, outerNode);
    if (!bridge) {
        return outerNode;
    }

    var bridgeReverse = splitPolygon(bridge, hole);

    // filter collinear points around the cuts
    filterPoints(bridgeReverse, bridgeReverse.next);
    return filterPoints(bridge, bridge.next);
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(hole, outerNode) {
    var p = outerNode,
        hx = hole.x,
        hy = hole.y,
        qx = -Infinity,
        m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
            var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
            if (x <= hx && x > qx) {
                qx = x;
                m = p.x < p.next.x ? p : p.next;
                if (x === hx) return m; // hole touches outer segment; pick leftmost endpoint
            }
        }
        p = p.next;
    } while (p !== outerNode);

    if (!m) return null;

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var stop = m,
        mx = m.x,
        my = m.y,
        tanMin = Infinity,
        tan;

    p = m;

    do {
        if (hx >= p.x && p.x >= mx && hx !== p.x &&
                pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

            tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

            if (locallyInside(p, hole) &&
                (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
                m = p;
                tanMin = tan;
            }
        }

        p = p.next;
    } while (p !== stop);

    return m;
}

// whether sector in vertex m contains sector in vertex p in the same coordinates
function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

// interlink polygon nodes in z-order
function indexCurve(start, minX, minY, invSize) {
    var p = start;
    do {
        if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
        p.prevZ = p.prev;
        p.nextZ = p.next;
        p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    sortLinked(p);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
        inSize = 1;

    do {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }
            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }

                if (tail) tail.nextZ = e;
                else list = e;

                e.prevZ = tail;
                tail = e;
            }

            p = q;
        }

        tail.nextZ = null;
        inSize *= 2;

    } while (numMerges > 1);

    return list;
}

// z-order of a point given coords and inverse of the longer side of data bbox
function zOrder(x, y, minX, minY, invSize) {
    // coords are transformed into non-negative 15-bit integer range
    x = (x - minX) * invSize | 0;
    y = (y - minY) * invSize | 0;

    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// find the leftmost node of a polygon ring
function getLeftmost(start) {
    var p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
        p = p.next;
    } while (p !== start);

    return leftmost;
}

// check if a point lies within a convex triangle
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
           (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
           (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // dones't intersect other edges
           (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
            (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
            equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0); // special zero-length case
}

// signed area of a triangle
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two points are equal
function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    var o1 = sign(area(p1, q1, p2));
    var o2 = sign(area(p1, q1, q2));
    var o3 = sign(area(p2, q2, p1));
    var o4 = sign(area(p2, q2, q1));

    if (o1 !== o2 && o3 !== o4) return true; // general case

    if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
    if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
    if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
    if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

    return false;
}

// for collinear points p, q, r, check if point q lies on segment pr
function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function sign(num) {
    return num > 0 ? 1 : num < 0 ? -1 : 0;
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(a, b) {
    var p = a;
    do {
        if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                intersects(p, p.next, a, b)) return true;
        p = p.next;
    } while (p !== a);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
        area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
        area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(a, b) {
    var p = a,
        inside = false,
        px = (a.x + b.x) / 2,
        py = (a.y + b.y) / 2;
    do {
        if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
            inside = !inside;
        p = p.next;
    } while (p !== a);

    return inside;
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a, b) {
    var a2 = new Node(a.i, a.x, a.y),
        b2 = new Node(b.i, b.x, b.y),
        an = a.next,
        bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i, x, y, last) {
    var p = new Node(i, x, y);

    if (!last) {
        p.prev = p;
        p.next = p;

    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function Node(i, x, y) {
    // vertex index in coordinates array
    this.i = i;

    // vertex coordinates
    this.x = x;
    this.y = y;

    // previous and next vertex nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = 0;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // indicates whether this is a steiner point
    this.steiner = false;
}

// return a percentage difference between the polygon area and its triangulation area;
// used to verify correctness of triangulation
earcut.deviation = function (data, holeIndices, dim, triangles) {
    var hasHoles = holeIndices && holeIndices.length;
    var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
    if (hasHoles) {
        for (var i = 0, len = holeIndices.length; i < len; i++) {
            var start = holeIndices[i] * dim;
            var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            polygonArea -= Math.abs(signedArea(data, start, end, dim));
        }
    }

    var trianglesArea = 0;
    for (i = 0; i < triangles.length; i += 3) {
        var a = triangles[i] * dim;
        var b = triangles[i + 1] * dim;
        var c = triangles[i + 2] * dim;
        trianglesArea += Math.abs(
            (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
            (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
    }

    return polygonArea === 0 && trianglesArea === 0 ? 0 :
        Math.abs((trianglesArea - polygonArea) / polygonArea);
};

function signedArea(data, start, end, dim) {
    var sum = 0;
    for (var i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}

// turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
earcut.flatten = function (data) {
    var dim = data[0][0].length,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
        }
        if (i > 0) {
            holeIndex += data[i - 1].length;
            result.holes.push(holeIndex);
        }
    }
    return result;
};

},{}],23:[function(require,module,exports){
var earcut = require('earcut')

module.exports = function (mesh, opts, f) {
  if (typeof opts === 'function') {
    f = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!f) f = function (x) { return null }
  var draw = opts.draw || {
    point: { positions: [], count: 0 },
    linestrip: { positions: [], count: 0 },
    triangle: { positions: [], cells: [] }
  }
  walk(mesh)
  return draw

  function walk (m) {
    if (m.features) m.features.forEach(walk)
    if (m.geometry) geometry(m.geometry, m)
    if (m.geometries) {
      m.geometries.forEach(function (g) { geometry(g, m) })
    }
  }
  function geometry (g, m) {
    if (g.type === 'Point') {
      draw.point.positions.push(g.coordinates)
      draw.point.count++
      if (f) {
        var xattrs = f(m, g, 0)
        if (xattrs) {
          var keys = Object.keys(xattrs)
          for (var i = 0; i < keys.length; i++) {
            if (!draw.point[keys[i]]) {
              draw.point[keys[i]] = []
            }
            draw.point[keys[i]].push(xattrs[keys[i]])
          }
        }
      }
    } else if (g.type === 'MultiPoint') {
      for (var i = 0; i < g.coordinates.length; i++) {
        draw.point.positions.push(g.coordinates[i])
        draw.point.count++
        if (f) {
          var xattrs = f(m, g.coordinates[i], i)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var i = 0; i < keys.length; i++) {
              if (!draw.point[keys[i]]) {
                draw.point[keys[i]] = []
              }
              draw.point[keys[i]].push(xattrs[keys[i]])
            }
          }
        }
      }
    } else if (g.type === 'LineString') {
      if (draw.linestrip.positions.length > 0) {
        var prev = draw.linestrip.positions[
          draw.linestrip.positions.length-1]
        draw.linestrip.positions.push(prev)
        draw.linestrip.count++
        if (f) {
          var xattrs = f(m, prev, 0, 1)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var i = 0; i < keys.length; i++) {
              if (!draw.linestrip[keys[i]]) {
                draw.linestrip[keys[i]] = []
              }
              draw.point[keys[i]].push(xattrs[keys[i]])
            }
          }
        }
        draw.linestrip.positions.push(g.coordinates[0])
        draw.linestrip.count++
        if (f) {
          var xattrs = f(m, g.coordinates[0], 0, 0)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var i = 0; i < keys.length; i++) {
              if (!draw.linestrip[keys[i]]) {
                draw.linestrip[keys[i]] = []
              }
              draw.linestrip[keys[i]].push(xattrs[keys[i]])
            }
          }
        }
      }
      for (var i = 0; i < g.coordinates.length; i++) {
        draw.linestrip.positions.push(g.coordinates[i])
        draw.linestrip.count++
        if (f) {
          var xattrs = f(m, g.coordinates[i], i, 0)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var i = 0; i < keys.length; i++) {
              if (!draw.linestrip[keys[i]]) {
                draw.linestrip[keys[i]] = []
              }
              draw.linestrip[keys[i]].push(xattrs[keys[i]])
            }
          }
        }
        draw.linestrip.positions.push(g.coordinates[i])
        draw.linestrip.count++
        if (f) {
          var xattrs = f(m, g.coordinates[i], i, 1)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var i = 0; i < keys.length; i++) {
              if (!draw.linestrip[keys[i]]) {
                draw.linestrip[keys[i]] = []
              }
              draw.linestrip[keys[i]].push(xattrs[keys[i]])
            }
          }
        }
      }
    } else if (g.type === 'MultiLineString') {
      for (var j = 0; j < g.coordinates.length; j++) {
        if (draw.linestrip.positions.length > 0) {
          var prev = draw.linestrip.positions[
            draw.linestrip.positions.length-1]
          draw.linestrip.positions.push(prev)
          draw.linestrip.count++
          if (f) {
            var xattrs = f(m, prev, j, 0, 1)
            if (xattrs) {
              var keys = Object.keys(xattrs)
              for (var i = 0; i < keys.length; i++) {
                if (!draw.linestrip[keys[i]]) {
                  draw.linestrip[keys[i]] = []
                }
                draw.point[keys[i]].push(xattrs[keys[i]])
              }
            }
          }
          draw.linestrip.positions.push(g.coordinates[j][0])
          draw.linestrip.count++
          if (f) {
            var xattrs = f(m, g.coordinates[j][0], j, 0, 0)
            if (xattrs) {
              var keys = Object.keys(xattrs)
              for (var i = 0; i < keys.length; i++) {
                if (!draw.linestrip[keys[i]]) {
                  draw.linestrip[keys[i]] = []
                }
                draw.linestrip[keys[i]].push(xattrs[keys[i]])
              }
            }
          }
        }
        for (var i = 0; i < g.coordinates[j].length; i++) {
          draw.linestrip.positions.push(g.coordinates[j][i])
          draw.linestrip.count++
          if (f) {
            var xattrs = f(m, g.coordinates[j][i], j, i, 0)
            if (xattrs) {
              var keys = Object.keys(xattrs)
              for (var i = 0; i < keys.length; i++) {
                if (!draw.linestrip[keys[i]]) {
                  draw.linestrip[keys[i]] = []
                }
                draw.linestrip[keys[i]].push(xattrs[keys[i]])
              }
            }
          }
          draw.linestrip.positions.push(g.coordinates[j][i])
          draw.linestrip.count++
          if (f) {
            var xattrs = f(m, g.coordinates[j][i], j, i, 1)
            if (xattrs) {
              var keys = Object.keys(xattrs)
              for (var i = 0; i < keys.length; i++) {
                if (!draw.linestrip[keys[i]]) {
                  draw.linestrip[keys[i]] = []
                }
                draw.linestrip[keys[i]].push(xattrs[keys[i]])
              }
            }
          }
        }
      }
    } else if (g.type === 'Polygon') {
      var data = earcut.flatten(g.coordinates)
      var cells = earcut(data.vertices, data.holes, data.dimensions)
      var len = draw.triangle.positions.length
      for (var i = 0; i < cells.length; i+=3) {
        var c = [len+cells[i],len+cells[i+1],len+cells[i+2]]
        draw.triangle.cells.push(c)
      }
      for (var i = 0; i < data.vertices.length; i+=2) {
        draw.triangle.positions.push(data.vertices.slice(i,i+2))
        if (f) {
          var xattrs = f(m, g.coordinates[i], i)
          if (xattrs) {
            var keys = Object.keys(xattrs)
            for (var j = 0; j < keys.length; j++) {
              if (!draw.triangle[keys[j]]) {
                draw.triangle[keys[j]] = []
              }
              draw.triangle[keys[j]].push(xattrs[keys[j]])
            }
          }
        }
      }
    } else if (g.type === 'MultiPolygon') {
      for (var j = 0; j < g.coordinates.length; j++) {
        var data = earcut.flatten(g.coordinates[j])
        var cells = earcut(data.vertices, data.holes, data.dimensions)
        var len = draw.triangle.positions.length
        for (var i = 0; i < cells.length; i+=3) {
          var c = [len+cells[i],len+cells[i+1],len+cells[i+2]]
          draw.triangle.cells.push(c)
        }
        for (var i = 0; i < data.vertices.length; i+=2) {
          draw.triangle.positions.push(data.vertices.slice(i,i+2))
          if (f) {
            var xattrs = f(m, g.coordinates[j][i], j, i)
            if (xattrs) {
              var keys = Object.keys(xattrs)
              for (var k = 0; k < keys.length; k++) {
                if (!draw.triangle[keys[k]]) {
                  draw.triangle[keys[k]] = []
                }
                draw.triangle[keys[k]].push(xattrs[keys[k]])
              }
            }
          }
        }
      }
    } else if (g.type === 'GeometryCollection') {
      if (g.geometries) {
        g.geometries.forEach(function (g) { geometry(g, m) })
      }
    }
  }
}

},{"earcut":22}],24:[function(require,module,exports){
module.exports = add;

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function add(out, a, b) {
    out[0] = a[0] + b[0]
    out[1] = a[1] + b[1]
    out[2] = a[2] + b[2]
    return out
}
},{}],25:[function(require,module,exports){
module.exports = angle

var fromValues = require('./fromValues')
var normalize = require('./normalize')
var dot = require('./dot')

/**
 * Get the angle between two 3D vectors
 * @param {vec3} a The first operand
 * @param {vec3} b The second operand
 * @returns {Number} The angle in radians
 */
function angle(a, b) {
    var tempA = fromValues(a[0], a[1], a[2])
    var tempB = fromValues(b[0], b[1], b[2])
 
    normalize(tempA, tempA)
    normalize(tempB, tempB)
 
    var cosine = dot(tempA, tempB)

    if(cosine > 1.0){
        return 0
    } else {
        return Math.acos(cosine)
    }     
}

},{"./dot":35,"./fromValues":41,"./normalize":52}],26:[function(require,module,exports){
module.exports = ceil

/**
 * Math.ceil the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to ceil
 * @returns {vec3} out
 */
function ceil(out, a) {
  out[0] = Math.ceil(a[0])
  out[1] = Math.ceil(a[1])
  out[2] = Math.ceil(a[2])
  return out
}

},{}],27:[function(require,module,exports){
module.exports = clone;

/**
 * Creates a new vec3 initialized with values from an existing vector
 *
 * @param {vec3} a vector to clone
 * @returns {vec3} a new 3D vector
 */
function clone(a) {
    var out = new Float32Array(3)
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    return out
}
},{}],28:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
function copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    return out
}
},{}],29:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */
function create() {
    var out = new Float32Array(3)
    out[0] = 0
    out[1] = 0
    out[2] = 0
    return out
}
},{}],30:[function(require,module,exports){
module.exports = cross;

/**
 * Computes the cross product of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function cross(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2],
        bx = b[0], by = b[1], bz = b[2]

    out[0] = ay * bz - az * by
    out[1] = az * bx - ax * bz
    out[2] = ax * by - ay * bx
    return out
}
},{}],31:[function(require,module,exports){
module.exports = require('./distance')

},{"./distance":32}],32:[function(require,module,exports){
module.exports = distance;

/**
 * Calculates the euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} distance between a and b
 */
function distance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2]
    return Math.sqrt(x*x + y*y + z*z)
}
},{}],33:[function(require,module,exports){
module.exports = require('./divide')

},{"./divide":34}],34:[function(require,module,exports){
module.exports = divide;

/**
 * Divides two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function divide(out, a, b) {
    out[0] = a[0] / b[0]
    out[1] = a[1] / b[1]
    out[2] = a[2] / b[2]
    return out
}
},{}],35:[function(require,module,exports){
module.exports = dot;

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
},{}],36:[function(require,module,exports){
module.exports = 0.000001

},{}],37:[function(require,module,exports){
module.exports = equals

var EPSILON = require('./epsilon')

/**
 * Returns whether or not the vectors have approximately the same elements in the same position.
 *
 * @param {vec3} a The first vector.
 * @param {vec3} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */
function equals(a, b) {
  var a0 = a[0]
  var a1 = a[1]
  var a2 = a[2]
  var b0 = b[0]
  var b1 = b[1]
  var b2 = b[2]
  return (Math.abs(a0 - b0) <= EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) &&
          Math.abs(a1 - b1) <= EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)) &&
          Math.abs(a2 - b2) <= EPSILON * Math.max(1.0, Math.abs(a2), Math.abs(b2)))
}

},{"./epsilon":36}],38:[function(require,module,exports){
module.exports = exactEquals

/**
 * Returns whether or not the vectors exactly have the same elements in the same position (when compared with ===)
 *
 * @param {vec3} a The first vector.
 * @param {vec3} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */
function exactEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

},{}],39:[function(require,module,exports){
module.exports = floor

/**
 * Math.floor the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to floor
 * @returns {vec3} out
 */
function floor(out, a) {
  out[0] = Math.floor(a[0])
  out[1] = Math.floor(a[1])
  out[2] = Math.floor(a[2])
  return out
}

},{}],40:[function(require,module,exports){
module.exports = forEach;

var vec = require('./create')()

/**
 * Perform some operation over an array of vec3s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
function forEach(a, stride, offset, count, fn, arg) {
        var i, l
        if(!stride) {
            stride = 3
        }

        if(!offset) {
            offset = 0
        }
        
        if(count) {
            l = Math.min((count * stride) + offset, a.length)
        } else {
            l = a.length
        }

        for(i = offset; i < l; i += stride) {
            vec[0] = a[i] 
            vec[1] = a[i+1] 
            vec[2] = a[i+2]
            fn(vec, vec, arg)
            a[i] = vec[0] 
            a[i+1] = vec[1] 
            a[i+2] = vec[2]
        }
        
        return a
}
},{"./create":29}],41:[function(require,module,exports){
module.exports = fromValues;

/**
 * Creates a new vec3 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} a new 3D vector
 */
function fromValues(x, y, z) {
    var out = new Float32Array(3)
    out[0] = x
    out[1] = y
    out[2] = z
    return out
}
},{}],42:[function(require,module,exports){
module.exports = {
  EPSILON: require('./epsilon')
  , create: require('./create')
  , clone: require('./clone')
  , angle: require('./angle')
  , fromValues: require('./fromValues')
  , copy: require('./copy')
  , set: require('./set')
  , equals: require('./equals')
  , exactEquals: require('./exactEquals')
  , add: require('./add')
  , subtract: require('./subtract')
  , sub: require('./sub')
  , multiply: require('./multiply')
  , mul: require('./mul')
  , divide: require('./divide')
  , div: require('./div')
  , min: require('./min')
  , max: require('./max')
  , floor: require('./floor')
  , ceil: require('./ceil')
  , round: require('./round')
  , scale: require('./scale')
  , scaleAndAdd: require('./scaleAndAdd')
  , distance: require('./distance')
  , dist: require('./dist')
  , squaredDistance: require('./squaredDistance')
  , sqrDist: require('./sqrDist')
  , length: require('./length')
  , len: require('./len')
  , squaredLength: require('./squaredLength')
  , sqrLen: require('./sqrLen')
  , negate: require('./negate')
  , inverse: require('./inverse')
  , normalize: require('./normalize')
  , dot: require('./dot')
  , cross: require('./cross')
  , lerp: require('./lerp')
  , random: require('./random')
  , transformMat4: require('./transformMat4')
  , transformMat3: require('./transformMat3')
  , transformQuat: require('./transformQuat')
  , rotateX: require('./rotateX')
  , rotateY: require('./rotateY')
  , rotateZ: require('./rotateZ')
  , forEach: require('./forEach')
}

},{"./add":24,"./angle":25,"./ceil":26,"./clone":27,"./copy":28,"./create":29,"./cross":30,"./dist":31,"./distance":32,"./div":33,"./divide":34,"./dot":35,"./epsilon":36,"./equals":37,"./exactEquals":38,"./floor":39,"./forEach":40,"./fromValues":41,"./inverse":43,"./len":44,"./length":45,"./lerp":46,"./max":47,"./min":48,"./mul":49,"./multiply":50,"./negate":51,"./normalize":52,"./random":53,"./rotateX":54,"./rotateY":55,"./rotateZ":56,"./round":57,"./scale":58,"./scaleAndAdd":59,"./set":60,"./sqrDist":61,"./sqrLen":62,"./squaredDistance":63,"./squaredLength":64,"./sub":65,"./subtract":66,"./transformMat3":67,"./transformMat4":68,"./transformQuat":69}],43:[function(require,module,exports){
module.exports = inverse;

/**
 * Returns the inverse of the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to invert
 * @returns {vec3} out
 */
function inverse(out, a) {
  out[0] = 1.0 / a[0]
  out[1] = 1.0 / a[1]
  out[2] = 1.0 / a[2]
  return out
}
},{}],44:[function(require,module,exports){
module.exports = require('./length')

},{"./length":45}],45:[function(require,module,exports){
module.exports = length;

/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
function length(a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    return Math.sqrt(x*x + y*y + z*z)
}
},{}],46:[function(require,module,exports){
module.exports = lerp;

/**
 * Performs a linear interpolation between two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */
function lerp(out, a, b, t) {
    var ax = a[0],
        ay = a[1],
        az = a[2]
    out[0] = ax + t * (b[0] - ax)
    out[1] = ay + t * (b[1] - ay)
    out[2] = az + t * (b[2] - az)
    return out
}
},{}],47:[function(require,module,exports){
module.exports = max;

/**
 * Returns the maximum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function max(out, a, b) {
    out[0] = Math.max(a[0], b[0])
    out[1] = Math.max(a[1], b[1])
    out[2] = Math.max(a[2], b[2])
    return out
}
},{}],48:[function(require,module,exports){
module.exports = min;

/**
 * Returns the minimum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function min(out, a, b) {
    out[0] = Math.min(a[0], b[0])
    out[1] = Math.min(a[1], b[1])
    out[2] = Math.min(a[2], b[2])
    return out
}
},{}],49:[function(require,module,exports){
module.exports = require('./multiply')

},{"./multiply":50}],50:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function multiply(out, a, b) {
    out[0] = a[0] * b[0]
    out[1] = a[1] * b[1]
    out[2] = a[2] * b[2]
    return out
}
},{}],51:[function(require,module,exports){
module.exports = negate;

/**
 * Negates the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to negate
 * @returns {vec3} out
 */
function negate(out, a) {
    out[0] = -a[0]
    out[1] = -a[1]
    out[2] = -a[2]
    return out
}
},{}],52:[function(require,module,exports){
module.exports = normalize;

/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */
function normalize(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    var len = x*x + y*y + z*z
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len)
        out[0] = a[0] * len
        out[1] = a[1] * len
        out[2] = a[2] * len
    }
    return out
}
},{}],53:[function(require,module,exports){
module.exports = random;

/**
 * Generates a random vector with the given scale
 *
 * @param {vec3} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec3} out
 */
function random(out, scale) {
    scale = scale || 1.0

    var r = Math.random() * 2.0 * Math.PI
    var z = (Math.random() * 2.0) - 1.0
    var zScale = Math.sqrt(1.0-z*z) * scale

    out[0] = Math.cos(r) * zScale
    out[1] = Math.sin(r) * zScale
    out[2] = z * scale
    return out
}
},{}],54:[function(require,module,exports){
module.exports = rotateX;

/**
 * Rotate a 3D vector around the x-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */
function rotateX(out, a, b, c){
    var by = b[1]
    var bz = b[2]

    // Translate point to the origin
    var py = a[1] - by
    var pz = a[2] - bz

    var sc = Math.sin(c)
    var cc = Math.cos(c)

    // perform rotation and translate to correct position
    out[0] = a[0]
    out[1] = by + py * cc - pz * sc
    out[2] = bz + py * sc + pz * cc

    return out
}

},{}],55:[function(require,module,exports){
module.exports = rotateY;

/**
 * Rotate a 3D vector around the y-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */
function rotateY(out, a, b, c){
    var bx = b[0]
    var bz = b[2]

    // translate point to the origin
    var px = a[0] - bx
    var pz = a[2] - bz
    
    var sc = Math.sin(c)
    var cc = Math.cos(c)
  
    // perform rotation and translate to correct position
    out[0] = bx + pz * sc + px * cc
    out[1] = a[1]
    out[2] = bz + pz * cc - px * sc
  
    return out
}

},{}],56:[function(require,module,exports){
module.exports = rotateZ;

/**
 * Rotate a 3D vector around the z-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */
function rotateZ(out, a, b, c){
    var bx = b[0]
    var by = b[1]

    //Translate point to the origin
    var px = a[0] - bx
    var py = a[1] - by
  
    var sc = Math.sin(c)
    var cc = Math.cos(c)

    // perform rotation and translate to correct position
    out[0] = bx + px * cc - py * sc
    out[1] = by + px * sc + py * cc
    out[2] = a[2]
  
    return out
}

},{}],57:[function(require,module,exports){
module.exports = round

/**
 * Math.round the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to round
 * @returns {vec3} out
 */
function round(out, a) {
  out[0] = Math.round(a[0])
  out[1] = Math.round(a[1])
  out[2] = Math.round(a[2])
  return out
}

},{}],58:[function(require,module,exports){
module.exports = scale;

/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */
function scale(out, a, b) {
    out[0] = a[0] * b
    out[1] = a[1] * b
    out[2] = a[2] * b
    return out
}
},{}],59:[function(require,module,exports){
module.exports = scaleAndAdd;

/**
 * Adds two vec3's after scaling the second operand by a scalar value
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec3} out
 */
function scaleAndAdd(out, a, b, scale) {
    out[0] = a[0] + (b[0] * scale)
    out[1] = a[1] + (b[1] * scale)
    out[2] = a[2] + (b[2] * scale)
    return out
}
},{}],60:[function(require,module,exports){
module.exports = set;

/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */
function set(out, x, y, z) {
    out[0] = x
    out[1] = y
    out[2] = z
    return out
}
},{}],61:[function(require,module,exports){
module.exports = require('./squaredDistance')

},{"./squaredDistance":63}],62:[function(require,module,exports){
module.exports = require('./squaredLength')

},{"./squaredLength":64}],63:[function(require,module,exports){
module.exports = squaredDistance;

/**
 * Calculates the squared euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} squared distance between a and b
 */
function squaredDistance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2]
    return x*x + y*y + z*z
}
},{}],64:[function(require,module,exports){
module.exports = squaredLength;

/**
 * Calculates the squared length of a vec3
 *
 * @param {vec3} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
function squaredLength(a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    return x*x + y*y + z*z
}
},{}],65:[function(require,module,exports){
module.exports = require('./subtract')

},{"./subtract":66}],66:[function(require,module,exports){
module.exports = subtract;

/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function subtract(out, a, b) {
    out[0] = a[0] - b[0]
    out[1] = a[1] - b[1]
    out[2] = a[2] - b[2]
    return out
}
},{}],67:[function(require,module,exports){
module.exports = transformMat3;

/**
 * Transforms the vec3 with a mat3.
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m the 3x3 matrix to transform with
 * @returns {vec3} out
 */
function transformMat3(out, a, m) {
    var x = a[0], y = a[1], z = a[2]
    out[0] = x * m[0] + y * m[3] + z * m[6]
    out[1] = x * m[1] + y * m[4] + z * m[7]
    out[2] = x * m[2] + y * m[5] + z * m[8]
    return out
}
},{}],68:[function(require,module,exports){
module.exports = transformMat4;

/**
 * Transforms the vec3 with a mat4.
 * 4th vector component is implicitly '1'
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec3} out
 */
function transformMat4(out, a, m) {
    var x = a[0], y = a[1], z = a[2],
        w = m[3] * x + m[7] * y + m[11] * z + m[15]
    w = w || 1.0
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    return out
}
},{}],69:[function(require,module,exports){
module.exports = transformQuat;

/**
 * Transforms the vec3 with a quat
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec3} out
 */
function transformQuat(out, a, q) {
    // benchmarks: http://jsperf.com/quaternion-transform-vec3-implementations

    var x = a[0], y = a[1], z = a[2],
        qx = q[0], qy = q[1], qz = q[2], qw = q[3],

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z

    // calculate result * inverse quat
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx
    return out
}
},{}],70:[function(require,module,exports){
(function (global){(function (){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"min-document":15}],71:[function(require,module,exports){
(function (global){(function (){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],72:[function(require,module,exports){
module.exports = function(strings) {
  if (typeof strings === 'string') strings = [strings]
  var exprs = [].slice.call(arguments,1)
  var parts = []
  for (var i = 0; i < strings.length-1; i++) {
    parts.push(strings[i], exprs[i] || '')
  }
  parts.push(strings[i])
  return parts.join('')
}

},{}],73:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],74:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        if (xstate === OPEN) {
          if (reg === '/') {
            p.push([ OPEN, '/', arg ])
            reg = ''
          } else {
            p.push([ OPEN, arg ])
          }
        } else if (xstate === COMMENT && opts.comments) {
          reg += String(arg)
        } else if (xstate !== COMMENT) {
          p.push([ VAR, xstate, arg ])
        }
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else parts[i][1]==="" || (cur[1][key] = concat(cur[1][key], parts[i][1]));
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else parts[i][2]==="" || (cur[1][key] = concat(cur[1][key], parts[i][2]));
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            if (parts[i][0] === CLOSE) {
              i--
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      if (opts.createFragment) return opts.createFragment(tree[2])
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN && reg.length) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && c === '/' && reg.length) {
          // no-op, self closing tag without a space <br/>
        } else if (state === OPEN && /\s/.test(c)) {
          if (reg.length) {
            res.push([OPEN, reg])
          }
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else if (x === null || x === undefined) return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":73}],75:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],76:[function(require,module,exports){
var containers = []; // will store container HTMLElement references
var styleElements = []; // will store {prepend: HTMLElement, append: HTMLElement}

var usage = 'insert-css: You need to provide a CSS string. Usage: insertCss(cssString[, options]).';

function insertCss(css, options) {
    options = options || {};

    if (css === undefined) {
        throw new Error(usage);
    }

    var position = options.prepend === true ? 'prepend' : 'append';
    var container = options.container !== undefined ? options.container : document.querySelector('head');
    var containerId = containers.indexOf(container);

    // first time we see this container, create the necessary entries
    if (containerId === -1) {
        containerId = containers.push(container) - 1;
        styleElements[containerId] = {};
    }

    // try to get the correponding container + position styleElement, create it otherwise
    var styleElement;

    if (styleElements[containerId] !== undefined && styleElements[containerId][position] !== undefined) {
        styleElement = styleElements[containerId][position];
    } else {
        styleElement = styleElements[containerId][position] = createStyleElement();

        if (position === 'prepend') {
            container.insertBefore(styleElement, container.childNodes[0]);
        } else {
            container.appendChild(styleElement);
        }
    }

    // strip potential UTF-8 BOM if css was read from a file
    if (css.charCodeAt(0) === 0xFEFF) { css = css.substr(1, css.length); }

    // actually add the stylesheet
    if (styleElement.styleSheet) {
        styleElement.styleSheet.cssText += css
    } else {
        styleElement.textContent += css;
    }

    return styleElement;
};

function createStyleElement() {
    var styleElement = document.createElement('style');
    styleElement.setAttribute('type', 'text/css');
    return styleElement;
}

module.exports = insertCss;
module.exports.insertCss = insertCss;

},{}],77:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],78:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],79:[function(require,module,exports){
var rcom = require('regl-component')
var Nano = require('cache-component')
var Map = require('./lib/map.js')

module.exports = MixMap

function MixMap (regl, opts) {
  var self = this
  if (!(self instanceof MixMap)) return new MixMap(regl, opts)
  Nano.call(self)
  if (!opts) opts = {}
  self._rcom = rcom(regl, opts)
  self._maps = []
  window.addEventListener('resize', redraw)
  window.addEventListener('scroll', redraw)
  function redraw () {
    draw()
    window.requestAnimationFrame(draw)
  }
  function draw () {
    for (var i = 0; i < self._maps.length; i++) {
      self._maps[i].draw()
    }
  }
}
MixMap.prototype = Object.create(Nano.prototype)

MixMap.prototype._update = function () { return false }

MixMap.prototype._render = function (props) {
  return this._rcom.render(props)
}
MixMap.prototype.create = function (opts) {
  var m = new Map(this._rcom.create(), opts)
  this._maps.push(m)
  return m
}

},{"./lib/map.js":83,"cache-component":18,"regl-component":92}],80:[function(require,module,exports){
module.exports = Object.assign || function (out) {
  var len = arguments.length
  for (var i = 1; i < len; i++) {
    var arg = arguments[i]
    if (arg === undefined || arg === null) continue
    var keys = Object.keys(arg)
    var klen = keys.length
    for (var j = 0; j < klen; j++) {
      var k = keys[j]
      out[k] = arg[k]
    }
  }
  return out
}

},{}],81:[function(require,module,exports){
var ln360 = Math.log2(360)
module.exports = function (bbox) {
  var dx = bbox[2] - bbox[0]
  var dy = bbox[3] - bbox[1]
  var d = Math.max(dx,dy)
  var zoom = ln360 - Math.log2(d) + 1
  return Math.max(Math.min(zoom,21),1)
}

},{}],82:[function(require,module,exports){
var assign = require('./assign.js')
module.exports = Draw

function Draw (drawOpts, opts) {
  if (!(this instanceof Draw)) return new Draw(drawOpts, opts)
  this._regl = opts.regl
  if (drawOpts.pickFrag) {
    drawOpts = assign({}, drawOpts)
    var pfrag = drawOpts.pickFrag
    var pvert = drawOpts.pickVert
    delete drawOpts.pickFrag
    delete drawOpts.pickVert
    this._pickOptions = assign({}, drawOpts, {
      frag: pfrag,
      vert: pvert || drawOpts.vert,
      context: assign(drawOpts.context || {}, {
        picking: true
      })
    })
  }
  this._drawOptions = assign({
    context: assign(drawOpts.context || {}, {
      picking: false
    })
  }, drawOpts)
  this.props = []
}

Draw.prototype._run = function (f, props) {
  if (!props) {
    f(this.props)
  } else if (Array.isArray(props) && props.length === 1) {
    for (var i = 0; i < this.props.length; i++) {
      assign(this.props[i], props[0])
    }
    f(this.props)
  } else if (Array.isArray(props)) {
    var xprops = []
    for (var i = 0; i < this.props.length; i++) {
      for (var j = 0; j < props.length; j++) {
        xprops.push(assign({}, this.props[i], props[j]))
      }
    }
    f(xprops)
  } else {
    for (var i = 0; i < this.props.length; i++) {
      assign(this.props[i], props)
    }
    f(this.props)
  }
}

Draw.prototype.draw = function (props) {
  if (!this._draw) {
    this._draw = this._regl(this._drawOptions)
  }
  this._run(this._draw, props)
}

Draw.prototype.pick = function (props) {
  if (this._pick) this._run(this._pick, props)
}

Draw.prototype._setfb = function (fb) {
  if (this._pickOptions) {
    this._pickOptions.framebuffer = fb
    this._pick = this._regl(this._pickOptions)
  }
}

Draw.prototype.reload = function () {
  this._draw = this._regl(this._drawOptions)
  if (this._pickOptions) {
    this._pick = this._regl(this._pickOptions)
  }
}

Draw.prototype.remove = function () {
  this._options.onremove()
}

},{"./assign.js":80}],83:[function(require,module,exports){
var html = require('bel')
var EventEmitter = require('events').EventEmitter
var onload = require('on-load')
var boxIntersect = require('box-intersect')
var defined = require('defined')
var bboxToZoom = require('./bbox-to-zoom.js')
var zoomToBbox = require('./zoom-to-bbox.js')
var Draw = require('./draw.js')
var assign = require('./assign.js')

var idlecb = window.requestIdleCallback
  || function (f) { setTimeout(f,0) }

var css = 0
var style = ((require('sheetify/insert')("._3adf25f5 {\n    -webkit-touch-callout: none;\n    -webkit-user-select: none;\n    -khtml-user-select: none;\n    -moz-user-select: none;\n    -ms-user-select: none;\n    user-select: none;\n  }") || true) && "_3adf25f5")

module.exports = Map

function Map (rcom, opts) {
  if (!(this instanceof Map)) return new Map(rcom, opts)
  if (!opts) opts = {}
  this._rcom = rcom
  this.regl = rcom.regl
  this._draw = []
  this._layers = []
  this._layerTiles = []
  this._viewboxQueue = []
  this._viewboxN = 0
  this._pickInit = false
  this._pickfbOptions = defined(opts.pickfb, {})
  this.viewbox = opts.viewbox || [-180,-90,180,90]
  this.backgroundColor = opts.backgroundColor || [1,1,1,1]
  this._mouse = null
  this._size = null
  this.size = null
  this.on('viewbox', this._onviewbox)
}
Map.prototype = Object.create(EventEmitter.prototype)

Map.prototype._viewboxQueueClear = function () {
  this._viewboxN++
  this._viewboxQueue = []
}
Map.prototype._viewboxEnqueue = function (fn) {
  var self = this
  self._viewboxQueue.push(fn)
  var n = self._viewboxN
  if (self._viewboxQueue.length === 1) next()
  function next () {
    if (n !== self._viewboxN) return
    if (self._viewboxQueue.length === 0) return
    self._viewboxQueue[0](function () {
      if (n !== self._viewboxN) return
      setTimeout(function () {
        idlecb(function () {
          if (n !== self._viewboxN) return
          self._viewboxQueue.shift()
          next()
        })
      }, 50)
    })
  }
}

Map.prototype._onviewbox = function () {
  var self = this
  if (self._idle) return
  self._idle = setTimeout(function () {
    idlecb(ready)
  }, 100)
  function ready () {
    self._idle = null
    self._viewboxQueueClear()
    var boxes = []
    var x0 = Math.floor((self.viewbox[0]+180)/360)*360
    var x1 = Math.floor((self.viewbox[2]+180)/360)*360
    for (var x = x0; x <= x1; x += 360) {
      boxes.push([
        self.viewbox[0]-x, self.viewbox[1],
        self.viewbox[2]-x, self.viewbox[3] ])
    }
    var zoom = self.getZoom()
    var pending = self._layers.length
    function done () {
      if (self._viewboxpending > 1) {
        setTimeout(function () {
          idlecb(function () {
            self._viewboxpending = 0
            ready()
          })
        }, 50)
      } else {
        self._viewboxpending = 0
      }
    }
    for (var i = 0; i < self._layers.length; i++) (function (layer,tiles) {
      layer.viewbox(self.viewbox, zoom, function (err, lboxes) {
        if (err) {
          if (--pending === 0) done()
          return self.emit('error', err)
        }
        if (!lboxes) lboxes = []
        var changed = false
        var lkeys = Object.keys(lboxes)
        var step = 10
        var active = {}
        for (var i = 0; i < lkeys.length; i+=step) (function (keys) {
          self._viewboxEnqueue(function (cb) {
            var values = keys.map(function (key) { return lboxes[key] })
            boxIntersect(boxes, values, function (j, k) {
              var key = keys[k], bbox = values[k]
              active[key] = true
              if (tiles[key]) return
              tiles[key] = bbox
              layer.add(key, bbox)
              changed = true
            })
            cb()
          })
        })(lkeys.slice(i,i+step))
        self._viewboxEnqueue(function (cb) {
          Object.keys(tiles).forEach(function (key) {
            if (tiles[key] && !active[key]) {
              layer.remove(key, tiles[key])
              changed = true
              tiles[key] = null
            }
          })
          if (changed) self.draw()
          if (--pending === 0) done()
          cb()
        })
      })
    })(self._layers[i],self._layerTiles[i])
  }
}

Map.prototype.prop = function (name) {
  return this.regl.prop(name)
}

Map.prototype.createDraw = function (opts) {
  var self = this
  if (!opts) throw new Error('must provide layer information to add()')
  var drawOpts = assign({
    frag: `
      precision highp float;
      void main () {
        gl_FragColor = vec4(1,0,0,1);
      }
    `,
    vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 vpos;
      uniform vec4 viewbox;
      uniform vec2 offset;
      uniform float zindex, aspect;
      void main () {
        vec2 p = position + offset;
        vpos = position;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(2.0+zindex), 1);
      }
    `,
  }, opts, {
    uniforms: assign({
      viewbox: self.prop('viewbox'),
      zoom: self.prop('zoom'),
      aspect: function (context) {
        return context.viewportWidth / context.viewportHeight
      },
      zindex: 0,
      offset: self.prop('offset')
    }, opts.uniforms)
  })
  var draw = new Draw(drawOpts, {
    regl: self.regl,
    onremove: function () {
      var ix = self._draw.indexOf(draw)
      if (ix >= 0) self._draw.splice(ix,1)
    }
  })
  self._draw.push(draw)
  self.draw()
  return draw
}

Map.prototype.addLayer = function (opts) {
  var self = this
  self._layers.push(opts)
  self._layerTiles.push({})
  if (!self._layerIdle) {
    self._layerIdle = idlecb(function () {
      self._layerIdle = null
      self._onviewbox()
    })
  }
}

Map.prototype._props = function () {
  var x0 = Math.floor((this.viewbox[0]+180)/360)*360
  var x1 = Math.floor((this.viewbox[2]+180)/360)*360
  var props = []
  var zoom = this.getZoom()
  for (var x = x0; x <= x1; x+= 360) {
    props.push({ viewbox: this.viewbox, zoom: zoom, offset: [x,0] })
  }
  return props
}

Map.prototype.draw = function () {
  this.regl.poll()
  this.regl.clear({ color: this.backgroundColor, depth: true })
  var props = this._props()
  for (var i = 0; i < this._draw.length; i++) {
    this._draw[i].draw(props)
  }
}

Map.prototype.pick = function (opts, cb) {
  if (!opts) opts = {}
  if (!cb) cb = function () {}
  var self = this
  var ex = defined(opts.offsetX, opts.x, 0)
  var ey = defined(opts.offsetY, opts.y, 0)
  var x = Math.max(0, Math.min(self._size[0]-1, ex))
  var y = Math.max(0, Math.min(self._size[1]-1, self._size[1] - ey))
  var first = false
  if (!self._fb) {
    self._fb = self.regl.framebuffer(self._pickfbOptions)
    for (var i = 0; i < self._draw.length; i++) {
      self._draw[i]._setfb(self._fb)
    }
  }
  if (self._pickInit === false) {
    self._pickInit = true
    self._fb.resize(self._size[0], self._size[1])
    self._fb.use(function () {
      var props = self._props()
      for (var i = 0; i < self._draw.length; i++) {
        self._draw[i].pick(props)
      }
      idlecb(function () {
        self.pick(opts, cb)
      })
    })
    return
  }
  idlecb(function () {
    self.regl.poll()
    self._fb.resize(self._size[0], self._size[1])
    self.regl.clear({
      color: [0,0,0,0],
      depth: true,
      framebuffer: self._fb
    })
    self._fb.use(function () {
      var props = self._props()
      for (var i = 0; i < self._draw.length; i++) {
        self._draw[i].pick(props)
      }
      var data = self.regl.read({
        framebuffer: self._fb,
        x: x,
        y: y,
        width: defined(opts.width, 1),
        height: defined(opts.height, 1)
      })
      cb(null, data)
    })
  })
}

Map.prototype._setMouse = function (ev) {
  var self = this
  var x = ev.offsetX
  var y = ev.offsetY
  var b = ev.buttons & 1
  if (!self._mouse) {
    self._mouse = [0,0]
  } else if (b && self._size) {
    var aspect = self._size[0] / self._size[1]
    self.move(
      (self._mouse[0]-x)/self._size[0],
      (self._mouse[1]-y)/self._size[1] / aspect
    )
  }
  self._mouse[0] = x
  self._mouse[1] = y
}

Map.prototype.move = function (dx,dy) {
  var self = this
  var w = self.viewbox[2] - self.viewbox[0]
  var h = self.viewbox[3] - self.viewbox[1]
  self.viewbox[0] += dx*w
  self.viewbox[1] -= dy*h
  self.viewbox[2] += dx*w
  self.viewbox[3] -= dy*h
  self.draw()
  self.emit('viewbox', self.viewbox)
}

Map.prototype.setViewbox = function (viewbox) {
  var self = this
  self.viewbox = viewbox
  self.emit('viewbox', self.viewbox)
}

Map.prototype._fixbbox = function () {
  if (this.viewbox[1] < -90) {
    this.viewbox[3] += -90 - this.viewbox[1]
    this.viewbox[1] = -90
  }
  if (this.viewbox[3] > 90) {
    this.viewbox[1] += 90 - this.viewbox[3]
    this.viewbox[3] = 90
  }
}

Map.prototype.render = function (props) {
  if (!props) props = {}
  var self = this
  var cstyle = `
    width: ${props.width}px;
    height: ${props.height}px;
  `
  if (!this._size) {
    this._size = [0,0]
    this.size = this._size
  }
  this._size[0] = props.width
  this._size[1] = props.height
  this.draw()
  this._relement = this._rcom.render(props)
  if (props.mouse === false) {
    this.element = html`<div class=${style} style=${cstyle}>
      <div>${this._relement}</div>
    </div>`
  } else {
    this.element = html`<div class=${style} style=${cstyle}>
      <div onmouseover=${move} onmouseout=${move}
      onmousemove=${move} onmousedown=${move} onmouseup=${move}>
        ${this._relement}
      </div>
    </div>`
  }
  onload(this.element,
    function () { self._load() },
    function () { self._unload() })
  return this.element
  function move (ev) { self._setMouse(ev) }
}

Map.prototype.resize = function (width, height) {
  this._size[0] = width
  this._size[1] = height
  this.element.style.width = width + 'px'
  this.element.style.height = height + 'px'
  var r = this._rcom.render({ width: width, height: height })
  this._relement = r
  this.emit('resize', width, height)
}

Map.prototype._load = function () {
  if (this._unloaded) {
    this._unloaded = false
    for (var i = 0; i < this._draw.length; i++) {
      this._draw[i].reload()
    }
  }
  this.draw()
}

Map.prototype._unload = function () {
  this._unloaded = true
}

Map.prototype.getZoom = function () {
  return bboxToZoom(this.viewbox)
}

Map.prototype.setZoom = function (n) {
  zoomToBbox(this.viewbox, Math.max(Math.min(n,21),1))
  this.draw()
  this.emit('viewbox', this.viewbox)
}

},{"./assign.js":80,"./bbox-to-zoom.js":81,"./draw.js":82,"./zoom-to-bbox.js":84,"bel":6,"box-intersect":8,"defined":20,"events":16,"on-load":90,"sheetify/insert":96}],84:[function(require,module,exports){
var ln360 = Math.log2(360)

module.exports = function (bbox,zoom) {
  var dx = bbox[2] - bbox[0]
  var dy = bbox[3] - bbox[1]
  var d = Math.pow(2, ln360 - zoom)
  var x = (bbox[2] + bbox[0]) * 0.5
  var y = (bbox[3] + bbox[1]) * 0.5
  var sx = dx < dy ? dx / dy : 1
  var sy = dy < dx ? dy / dx : 1
  bbox[0] = x - d * sx
  bbox[1] = y - d * sy
  bbox[2] = x + d * sx
  bbox[3] = y + d * sy
  return bbox
}

},{}],85:[function(require,module,exports){
assert.notEqual = notEqual
assert.notOk = notOk
assert.equal = equal
assert.ok = assert

module.exports = assert

function equal (a, b, m) {
  assert(a == b, m) // eslint-disable-line eqeqeq
}

function notEqual (a, b, m) {
  assert(a != b, m) // eslint-disable-line eqeqeq
}

function notOk (t, m) {
  assert(!t, m)
}

function assert (t, m) {
  if (!t) throw new Error(m || 'AssertionError')
}

},{}],86:[function(require,module,exports){
var assert = require('nanoassert')
var morph = require('./lib/morph')

var TEXT_NODE = 3
// var DEBUG = false

module.exports = nanomorph

// Morph one tree into another tree
//
// no parent
//   -> same: diff and walk children
//   -> not same: replace and return
// old node doesn't exist
//   -> insert new node
// new node doesn't exist
//   -> delete old node
// nodes are not the same
//   -> diff nodes and apply patch to old node
// nodes are the same
//   -> walk all child nodes and append to old node
function nanomorph (oldTree, newTree, options) {
  // if (DEBUG) {
  //   console.log(
  //   'nanomorph\nold\n  %s\nnew\n  %s',
  //   oldTree && oldTree.outerHTML,
  //   newTree && newTree.outerHTML
  // )
  // }
  assert.equal(typeof oldTree, 'object', 'nanomorph: oldTree should be an object')
  assert.equal(typeof newTree, 'object', 'nanomorph: newTree should be an object')

  if (options && options.childrenOnly) {
    updateChildren(newTree, oldTree)
    return oldTree
  }

  assert.notEqual(
    newTree.nodeType,
    11,
    'nanomorph: newTree should have one root node (which is not a DocumentFragment)'
  )

  return walk(newTree, oldTree)
}

// Walk and morph a dom tree
function walk (newNode, oldNode) {
  // if (DEBUG) {
  //   console.log(
  //   'walk\nold\n  %s\nnew\n  %s',
  //   oldNode && oldNode.outerHTML,
  //   newNode && newNode.outerHTML
  // )
  // }
  if (!oldNode) {
    return newNode
  } else if (!newNode) {
    return null
  } else if (newNode.isSameNode && newNode.isSameNode(oldNode)) {
    return oldNode
  } else if (newNode.tagName !== oldNode.tagName || getComponentId(newNode) !== getComponentId(oldNode)) {
    return newNode
  } else {
    morph(newNode, oldNode)
    updateChildren(newNode, oldNode)
    return oldNode
  }
}

function getComponentId (node) {
  return node.dataset ? node.dataset.nanomorphComponentId : undefined
}

// Update the children of elements
// (obj, obj) -> null
function updateChildren (newNode, oldNode) {
  // if (DEBUG) {
  //   console.log(
  //   'updateChildren\nold\n  %s\nnew\n  %s',
  //   oldNode && oldNode.outerHTML,
  //   newNode && newNode.outerHTML
  // )
  // }
  var oldChild, newChild, morphed, oldMatch

  // The offset is only ever increased, and used for [i - offset] in the loop
  var offset = 0

  for (var i = 0; ; i++) {
    oldChild = oldNode.childNodes[i]
    newChild = newNode.childNodes[i - offset]
    // if (DEBUG) {
    //   console.log(
    //   '===\n- old\n  %s\n- new\n  %s',
    //   oldChild && oldChild.outerHTML,
    //   newChild && newChild.outerHTML
    // )
    // }
    // Both nodes are empty, do nothing
    if (!oldChild && !newChild) {
      break

    // There is no new child, remove old
    } else if (!newChild) {
      oldNode.removeChild(oldChild)
      i--

    // There is no old child, add new
    } else if (!oldChild) {
      oldNode.appendChild(newChild)
      offset++

    // Both nodes are the same, morph
    } else if (same(newChild, oldChild)) {
      morphed = walk(newChild, oldChild)
      if (morphed !== oldChild) {
        oldNode.replaceChild(morphed, oldChild)
        offset++
      }

    // Both nodes do not share an ID or a placeholder, try reorder
    } else {
      oldMatch = null

      // Try and find a similar node somewhere in the tree
      for (var j = i; j < oldNode.childNodes.length; j++) {
        if (same(oldNode.childNodes[j], newChild)) {
          oldMatch = oldNode.childNodes[j]
          break
        }
      }

      // If there was a node with the same ID or placeholder in the old list
      if (oldMatch) {
        morphed = walk(newChild, oldMatch)
        if (morphed !== oldMatch) offset++
        oldNode.insertBefore(morphed, oldChild)

      // It's safe to morph two nodes in-place if neither has an ID
      } else if (!newChild.id && !oldChild.id) {
        morphed = walk(newChild, oldChild)
        if (morphed !== oldChild) {
          oldNode.replaceChild(morphed, oldChild)
          offset++
        }

      // Insert the node at the index if we couldn't morph or find a matching node
      } else {
        oldNode.insertBefore(newChild, oldChild)
        offset++
      }
    }
  }
}

function same (a, b) {
  if (a.id) return a.id === b.id
  if (a.isSameNode) return a.isSameNode(b)
  if (a.tagName !== b.tagName) return false
  if (a.type === TEXT_NODE) return a.nodeValue === b.nodeValue
  return false
}

},{"./lib/morph":88,"nanoassert":85}],87:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'ontouchcancel',
  'ontouchend',
  'ontouchmove',
  'ontouchstart',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  'onanimationend',
  'onanimationiteration',
  'onanimationstart',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],88:[function(require,module,exports){
var events = require('./events')
var eventsLength = events.length

var ELEMENT_NODE = 1
var TEXT_NODE = 3
var COMMENT_NODE = 8

module.exports = morph

// diff elements and apply the resulting patch to the old node
// (obj, obj) -> null
function morph (newNode, oldNode) {
  var nodeType = newNode.nodeType
  var nodeName = newNode.nodeName

  if (nodeType === ELEMENT_NODE) {
    copyAttrs(newNode, oldNode)
  }

  if (nodeType === TEXT_NODE || nodeType === COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue
    }
  }

  // Some DOM nodes are weird
  // https://github.com/patrick-steele-idem/morphdom/blob/master/src/specialElHandlers.js
  if (nodeName === 'INPUT') updateInput(newNode, oldNode)
  else if (nodeName === 'OPTION') updateOption(newNode, oldNode)
  else if (nodeName === 'TEXTAREA') updateTextarea(newNode, oldNode)

  copyEvents(newNode, oldNode)
}

function copyAttrs (newNode, oldNode) {
  var oldAttrs = oldNode.attributes
  var newAttrs = newNode.attributes
  var attrNamespaceURI = null
  var attrValue = null
  var fromValue = null
  var attrName = null
  var attr = null

  for (var i = newAttrs.length - 1; i >= 0; --i) {
    attr = newAttrs[i]
    attrName = attr.name
    attrNamespaceURI = attr.namespaceURI
    attrValue = attr.value
    if (attrNamespaceURI) {
      attrName = attr.localName || attrName
      fromValue = oldNode.getAttributeNS(attrNamespaceURI, attrName)
      if (fromValue !== attrValue) {
        oldNode.setAttributeNS(attrNamespaceURI, attrName, attrValue)
      }
    } else {
      if (!oldNode.hasAttribute(attrName)) {
        oldNode.setAttribute(attrName, attrValue)
      } else {
        fromValue = oldNode.getAttribute(attrName)
        if (fromValue !== attrValue) {
          // apparently values are always cast to strings, ah well
          if (attrValue === 'null' || attrValue === 'undefined') {
            oldNode.removeAttribute(attrName)
          } else {
            oldNode.setAttribute(attrName, attrValue)
          }
        }
      }
    }
  }

  // Remove any extra attributes found on the original DOM element that
  // weren't found on the target element.
  for (var j = oldAttrs.length - 1; j >= 0; --j) {
    attr = oldAttrs[j]
    if (attr.specified !== false) {
      attrName = attr.name
      attrNamespaceURI = attr.namespaceURI

      if (attrNamespaceURI) {
        attrName = attr.localName || attrName
        if (!newNode.hasAttributeNS(attrNamespaceURI, attrName)) {
          oldNode.removeAttributeNS(attrNamespaceURI, attrName)
        }
      } else {
        if (!newNode.hasAttributeNS(null, attrName)) {
          oldNode.removeAttribute(attrName)
        }
      }
    }
  }
}

function copyEvents (newNode, oldNode) {
  for (var i = 0; i < eventsLength; i++) {
    var ev = events[i]
    if (newNode[ev]) {           // if new element has a whitelisted attribute
      oldNode[ev] = newNode[ev]  // update existing element
    } else if (oldNode[ev]) {    // if existing element has it and new one doesnt
      oldNode[ev] = undefined    // remove it from existing element
    }
  }
}

function updateOption (newNode, oldNode) {
  updateAttribute(newNode, oldNode, 'selected')
}

// The "value" attribute is special for the <input> element since it sets the
// initial value. Changing the "value" attribute without changing the "value"
// property will have no effect since it is only used to the set the initial
// value. Similar for the "checked" attribute, and "disabled".
function updateInput (newNode, oldNode) {
  var newValue = newNode.value
  var oldValue = oldNode.value

  updateAttribute(newNode, oldNode, 'checked')
  updateAttribute(newNode, oldNode, 'disabled')

  // The "indeterminate" property can not be set using an HTML attribute.
  // See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox
  if (newNode.indeterminate !== oldNode.indeterminate) {
    oldNode.indeterminate = newNode.indeterminate
  }

  // Persist file value since file inputs can't be changed programatically
  if (oldNode.type === 'file') return

  if (newValue !== oldValue) {
    oldNode.setAttribute('value', newValue)
    oldNode.value = newValue
  }

  if (newValue === 'null') {
    oldNode.value = ''
    oldNode.removeAttribute('value')
  }

  if (!newNode.hasAttributeNS(null, 'value')) {
    oldNode.removeAttribute('value')
  } else if (oldNode.type === 'range') {
    // this is so elements like slider move their UI thingy
    oldNode.value = newValue
  }
}

function updateTextarea (newNode, oldNode) {
  var newValue = newNode.value
  if (newValue !== oldNode.value) {
    oldNode.value = newValue
  }

  if (oldNode.firstChild && oldNode.firstChild.nodeValue !== newValue) {
    // Needed for IE. Apparently IE sets the placeholder as the
    // node value and vise versa. This ignores an empty update.
    if (newValue === '' && oldNode.firstChild.nodeValue === oldNode.placeholder) {
      return
    }

    oldNode.firstChild.nodeValue = newValue
  }
}

function updateAttribute (newNode, oldNode, name) {
  if (newNode[name] !== oldNode[name]) {
    oldNode[name] = newNode[name]
    if (newNode[name]) {
      oldNode.setAttribute(name, '')
    } else {
      oldNode.removeAttribute(name)
    }
  }
}

},{"./events":87}],89:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
      case "[object BigInt64Array]":
        return "bigint64"
      case "[object BigUint64Array]":
        return "biguint64"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "bigint64": [],
  "biguint64": [],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":77,"is-buffer":78}],90:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var assert = require('assert')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + (new Date() % 9e6).toString(36)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, turnoff)
      eachMutation(mutations[i].addedNodes, turnon)
    }
  })
  if (document.body) {
    beginObserve(observer)
  } else {
    document.addEventListener('DOMContentLoaded', function (event) {
      beginObserve(observer)
    })
  }
}

function beginObserve (observer) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  assert(document.body, 'on-load: will not work prior to DOMContentLoaded')
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

module.exports.KEY_ATTR = KEY_ATTR
module.exports.KEY_ID = KEY_ID

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"assert":85,"global/document":70,"global/window":71}],91:[function(require,module,exports){
var r=perlinNoise3d=function(){for(var r=Math.floor(720),n=new Array(r),t=new Array(r),i=Math.PI/180,e=0;e<r;e++)n[e]=Math.sin(e*i*.5),t[e]=Math.cos(e*i*.5);var o=r;o>>=1;var l=function(){this.perlin_octaves=4,this.perlin_amp_falloff=.5,this.perlin=null};return l.prototype={noiseSeed:function(r){var n=function(){var r,n,t=4294967296;return{setSeed:function(i){n=r=(null==i?Math.random()*t:i)>>>0},getSeed:function(){return r},rand:function(){return(n=(1664525*n+1013904223)%t)/t}}}();n.setSeed(r),this.perlin=new Array(4096);for(var t=0;t<4096;t++)this.perlin[t]=n.rand();return this},get:function(n,i,e){if(i=i||0,e=e||0,null==this.perlin){this.perlin=new Array(4096);for(var l=0;l<4096;l++)this.perlin[l]=Math.random()}n<0&&(n=-n),i<0&&(i=-i),e<0&&(e=-e);for(var a,h,s,f,p,u=Math.floor(n),c=Math.floor(i),v=Math.floor(e),d=n-u,M=i-c,_=e-v,m=0,y=.5,w=function(n){return.5*(1-t[Math.floor(n*o)%r])},A=0;A<this.perlin_octaves;A++){var S=u+(c<<4)+(v<<8);a=w(d),h=w(M),s=this.perlin[4095&S],s+=a*(this.perlin[S+1&4095]-s),f=this.perlin[S+16&4095],s+=h*((f+=a*(this.perlin[S+16+1&4095]-f))-s),f=this.perlin[4095&(S+=256)],f+=a*(this.perlin[S+1&4095]-f),p=this.perlin[S+16&4095],f+=h*((p+=a*(this.perlin[S+16+1&4095]-p))-f),m+=(s+=w(_)*(f-s))*y,y*=this.perlin_amp_falloff,u<<=1,c<<=1,v<<=1,(d*=2)>=1&&(u++,d--),(M*=2)>=1&&(c++,M--),(_*=2)>=1&&(v++,_--)}return m}},l}();module.exports=r;

},{}],92:[function(require,module,exports){
var Nano = require('cache-component')
var defregl = require('deferred-regl')
var mregl = require('./multi.js')
var onload = require('on-load')

module.exports = Root

function Root (regl, opts) {
  if (!(this instanceof Root)) return new Root(regl, opts)
  Nano.call(this)
  this.components = []
  this._regl = regl
  this._opts = opts
}
Root.prototype = Object.create(Nano.prototype)

Root.prototype.create = function () {
  var c = new Component()
  this.components.push(c)
  if (this._mregl) c._setMregl(this._mregl)
  return c
}

Root.prototype._render = function () {
  var self = this
  if (!this.element) {
    this.element = document.createElement('div')
    this.canvas = document.createElement('canvas')
    this.element.appendChild(this.canvas)
    onload(this.element,
      function () { self._load() },
      function () { self._unload() })
  }
  return this.element
}

Root.prototype._update = function () { return false }

Root.prototype._load = function () {
  this._mregl = mregl(this._regl, this.canvas, this._opts)
  for (var i = 0; i < this.components.length; i++) {
    this.components[i]._setMregl(this._mregl)
  }
}

Root.prototype._unload = function () {
  this._mregl.destroy()
  this.element = null
  this.canvas = null
  for (var i = 0; i < this.components.length; i++) {
    this.components[i]._setMregl(null)
  }
  this._mregl = null
}

function Component (opts) {
  var self = this
  if (!(self instanceof Component)) return new Component(opts)
  Nano.call(self)
  if (!opts) opts = {}
  self._elwidth = null
  self._elheight = null
  self._opts = opts
  self.element = document.createElement('div')
  onload(self.element,
    function () { self._load() },
    function () { self._unload() })
  self.element.style.display = 'inline-block'
  if (opts.width) {
    self.element.style.width = opts.width + 'px'
    self._elwidth = opts.width
  }
  if (opts.height) {
    self.element.style.height = opts.height + 'px'
    self._elheight = opts.height
  }
  self.regl = defregl()
  self._regl = null
  self._mregl = null
  self._mreglqueue = []
}
Component.prototype = Object.create(Nano.prototype)

Component.prototype._getMregl = function (fn) {
  if (this._mregl) fn(this._mregl)
  else {
    if (!this._mreglqueue) this._mreglqueue = []
    this._mreglqueue.push(fn)
  }
}
Component.prototype._setMregl = function (mr) {
  this._mregl = mr
  if (this._mreglqueue) {
    for (var i = 0; i < this._mreglqueue.length; i++) {
      this._mreglqueue[i](this._mregl)
    }
  }
  this._mreglqueue = null
}

Component.prototype._update = function (props) {
  return this._elwidth !== props.width
    || this._elheight !== props.height
}

Component.prototype._render = function (props) {
  var self = this
  if (props.width !== this._elwidth) {
    this.element.style.width = props.width + 'px'
    this._elwidth = props.width
  }
  if (props.height !== this._elheight) {
    this.element.style.height = props.height + 'px'
    this._elheight = props.height
  }
  return this.element
}

Component.prototype._load = function () {
  var self = this
  if (self._regl) return
  self._getMregl(function (mregl) {
    self._regl = mregl(self.element)
    self.regl.setRegl(self._regl)
  })
}

Component.prototype._unload = function () {
  if (this._regl) {
    this._regl.destroy()
    this._regl = null
    this.regl.setRegl(null)
  }
}

},{"./multi.js":93,"cache-component":18,"deferred-regl":19,"on-load":90}],93:[function(require,module,exports){
// copied from multi-regl

module.exports = function createMultiplexor (createREGL, canvas, inputs) {
  var reglInput = {}
  if (inputs) {
    Object.keys(inputs).forEach(function (input) {
      reglInput[input] = inputs[input]
    })
  }

  var pixelRatio = reglInput.pixelRatio || window.devicePixelRatio
  reglInput.pixelRatio = pixelRatio

  var canvasStyle = canvas.style
  canvasStyle.position = 'fixed'
  canvasStyle.left =
  canvasStyle.top = '0px'
  canvasStyle.width =
  canvasStyle.height = '100%'
  canvasStyle['pointer-events'] = 'none'
  canvasStyle['touch-action'] = 'none'
  canvasStyle['z-index'] = '1000'

  function resize () {
    canvas.width = pixelRatio * window.innerWidth
    canvas.height = pixelRatio * window.innerHeight
    if (!setRAF && regl) regl.draw(frame)
  }

  resize()

  window.addEventListener('resize', resize, false)
  window.addEventListener('scroll', function () {
    if (!setRAF) regl.draw(frame)
  }, false)

  reglInput.canvas = canvas
  delete reglInput.gl
  delete reglInput.container

  var regl = createREGL(reglInput)
  var subcontexts = []

  var viewBox = {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }

  function createSubContext (input) {
    var element
    if (typeof input === 'object' && input) {
      if (typeof input.getBoundingClientRect === 'function') {
        element = input
      } else if (input.element) {
        element = input.element
      }
    } else if (typeof input === 'string') {
      element = document.querySelector(element)
    }
    if (!element) {
      element = document.body
    }

    var subcontext = {
      tick: 0,
      element: element,
      callbacks: []
    }

    subcontexts.push(subcontext)

    function wrapBox (boxDesc) {
      return boxDesc
    }

    var scheduled = false
    function schedule (cb) {
      subcontext.callbacks.push(cb)
      if (!scheduled) {
        scheduled = true
        window.requestAnimationFrame(draw)
      }
      function draw () {
        regl.draw(frame)
        scheduled = false
      }
    }

    function subREGL (options) {
      if ('viewport' in options) {
        options.viewport = wrapBox(options.viewport)
      }
      if ('scissor' in options) {
        if ('box' in options) {
          options.scissor.box = wrapBox(options.scissor.box)
        }
        if ('enable' in options) {
          options.scissor.box = true
        }
      }
      var draw = regl.apply(regl, Array.prototype.slice.call(arguments))
      if (!setRAF) {
        return function () {
          if (setRAF) return draw.apply(this, arguments)
          var args = arguments
          schedule(function () {
            draw.apply(null, args)
          })
        }
      } else return draw
    }

    Object.keys(regl).forEach(function (option) {
      if (option === 'clear') {
        subREGL.clear = function (opts) {
          if (opts && opts.framebuffer) {
            if (setRAF) return clear.apply(this,arguments)
            var args = arguments
            schedule(function () {
              regl.clear.apply(null, args)
            })
          } else {
            if (setRAF) return regl[option].apply(this, arguments)
            subcontext.callbacks = []
            var args = arguments
            schedule(function () {
              regl.clear.apply(null, args)
            })
          }
        }
      } else if (option === 'draw') {
        subREGL.draw = function () {
          if (setRAF) return regl[option].apply(this, arguments)
          var args = arguments
          schedule(function () {
            regl.draw.apply(null, args)
          })
        }
      } else subREGL[option] = regl[option]
    })

    subREGL.frame = function subFrame (cb) {
      setRAF = true
      subcontext.callbacks.push(cb)
      regl.frame(frame)
      return {
        cancel: function () {
          subcontext.callbacks.splice(subcontext.callbacks.indexOf(cb), 1)
        }
      }
    }

    subREGL.destroy = function () {
      subcontexts.splice(subcontexts.indexOf(subcontext), 1)
    }

    subREGL.container = element

    return subREGL
  }

  createSubContext.destroy = function () {
    regl.destroy()
  }

  createSubContext.regl = regl

  var setViewport = regl({
    context: {
      tick: regl.prop('subcontext.tick')
    },

    viewport: regl.prop('viewbox'),

    scissor: {
      enable: true,
      box: regl.prop('scissorbox')
    }
  })

  function executeCallbacks (context, props) {
    var callbacks = props.subcontext.callbacks
    for (var i = 0; i < callbacks.length; ++i) {
      callbacks[i](context)
    }
  }

  var setRAF = false
  function frame (context) {
    regl.clear({
      color: [0, 0, 0, 0]
    })

    var width = window.innerWidth
    var height = window.innerHeight

    var pixelRatio = context.pixelRatio
    for (var i = 0; i < subcontexts.length; ++i) {
      var sc = subcontexts[i]
      var rect = sc.element.getBoundingClientRect()

      if (rect.right < 0 || rect.bottom < 0 ||
        width < rect.left || height < rect.top) {
        continue
      }

      viewBox.x = pixelRatio * (rect.left)
      viewBox.y = pixelRatio * (height - rect.bottom)
      viewBox.width = pixelRatio * (rect.right - rect.left)
      viewBox.height = pixelRatio * (rect.bottom - rect.top)

      setViewport({
        subcontext: sc,
        viewbox: viewBox,
        scissorbox: viewBox
      }, executeCallbacks)

      sc.tick += 1
    }
  }

  return createSubContext
}

},{}],94:[function(require,module,exports){
(function(Z,ka){"object"===typeof exports&&"undefined"!==typeof module?module.exports=ka():"function"===typeof define&&define.amd?define(ka):Z.createREGL=ka()})(this,function(){function Z(a,b){this.id=Db++;this.type=a;this.data=b}function ka(a){if(0===a.length)return[];var b=a.charAt(0),c=a.charAt(a.length-1);if(1<a.length&&b===c&&('"'===b||"'"===b))return['"'+a.substr(1,a.length-2).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];if(b=/\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(a))return ka(a.substr(0,
b.index)).concat(ka(b[1])).concat(ka(a.substr(b.index+b[0].length)));b=a.split(".");if(1===b.length)return['"'+a.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];a=[];for(c=0;c<b.length;++c)a=a.concat(ka(b[c]));return a}function cb(a){return"["+ka(a).join("][")+"]"}function db(a,b){if("function"===typeof a)return new Z(0,a);if("number"===typeof a||"boolean"===typeof a)return new Z(5,a);if(Array.isArray(a))return new Z(6,a.map(function(a,e){return db(a,b+"["+e+"]")}));if(a instanceof Z)return a}function Eb(){var a=
{"":0},b=[""];return{id:function(c){var e=a[c];if(e)return e;e=a[c]=b.length;b.push(c);return e},str:function(a){return b[a]}}}function Fb(a,b,c){function e(){var b=window.innerWidth,e=window.innerHeight;a!==document.body&&(e=f.getBoundingClientRect(),b=e.right-e.left,e=e.bottom-e.top);f.width=c*b;f.height=c*e}var f=document.createElement("canvas");L(f.style,{border:0,margin:0,padding:0,top:0,left:0,width:"100%",height:"100%"});a.appendChild(f);a===document.body&&(f.style.position="absolute",L(a.style,
{margin:0,padding:0}));var d;a!==document.body&&"function"===typeof ResizeObserver?(d=new ResizeObserver(function(){setTimeout(e)}),d.observe(a)):window.addEventListener("resize",e,!1);e();return{canvas:f,onDestroy:function(){d?d.disconnect():window.removeEventListener("resize",e);a.removeChild(f)}}}function Gb(a,b){function c(c){try{return a.getContext(c,b)}catch(f){return null}}return c("webgl")||c("experimental-webgl")||c("webgl-experimental")}function eb(a){return"string"===typeof a?a.split():
a}function fb(a){return"string"===typeof a?document.querySelector(a):a}function Hb(a){var b=a||{},c,e,f,d;a={};var q=[],n=[],v="undefined"===typeof window?1:window.devicePixelRatio,k=!1,u=function(a){},m=function(){};"string"===typeof b?c=document.querySelector(b):"object"===typeof b&&("string"===typeof b.nodeName&&"function"===typeof b.appendChild&&"function"===typeof b.getBoundingClientRect?c=b:"function"===typeof b.drawArrays||"function"===typeof b.drawElements?(d=b,f=d.canvas):("gl"in b?d=b.gl:
"canvas"in b?f=fb(b.canvas):"container"in b&&(e=fb(b.container)),"attributes"in b&&(a=b.attributes),"extensions"in b&&(q=eb(b.extensions)),"optionalExtensions"in b&&(n=eb(b.optionalExtensions)),"onDone"in b&&(u=b.onDone),"profile"in b&&(k=!!b.profile),"pixelRatio"in b&&(v=+b.pixelRatio)));c&&("canvas"===c.nodeName.toLowerCase()?f=c:e=c);if(!d){if(!f){c=Fb(e||document.body,u,v);if(!c)return null;f=c.canvas;m=c.onDestroy}void 0===a.premultipliedAlpha&&(a.premultipliedAlpha=!0);d=Gb(f,a)}return d?{gl:d,
canvas:f,container:e,extensions:q,optionalExtensions:n,pixelRatio:v,profile:k,onDone:u,onDestroy:m}:(m(),u("webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org"),null)}function Ib(a,b){function c(b){b=b.toLowerCase();var c;try{c=e[b]=a.getExtension(b)}catch(f){}return!!c}for(var e={},f=0;f<b.extensions.length;++f){var d=b.extensions[f];if(!c(d))return b.onDestroy(),b.onDone('"'+d+'" extension is not supported by the current WebGL context, try upgrading your system or a different browser'),
null}b.optionalExtensions.forEach(c);return{extensions:e,restore:function(){Object.keys(e).forEach(function(a){if(e[a]&&!c(a))throw Error("(regl): error restoring extension "+a);})}}}function R(a,b){for(var c=Array(a),e=0;e<a;++e)c[e]=b(e);return c}function gb(a){var b,c;b=(65535<a)<<4;a>>>=b;c=(255<a)<<3;a>>>=c;b|=c;c=(15<a)<<2;a>>>=c;b|=c;c=(3<a)<<1;return b|c|a>>>c>>1}function hb(){function a(a){a:{for(var b=16;268435456>=b;b*=16)if(a<=b){a=b;break a}a=0}b=c[gb(a)>>2];return 0<b.length?b.pop():
new ArrayBuffer(a)}function b(a){c[gb(a.byteLength)>>2].push(a)}var c=R(8,function(){return[]});return{alloc:a,free:b,allocType:function(b,c){var d=null;switch(b){case 5120:d=new Int8Array(a(c),0,c);break;case 5121:d=new Uint8Array(a(c),0,c);break;case 5122:d=new Int16Array(a(2*c),0,c);break;case 5123:d=new Uint16Array(a(2*c),0,c);break;case 5124:d=new Int32Array(a(4*c),0,c);break;case 5125:d=new Uint32Array(a(4*c),0,c);break;case 5126:d=new Float32Array(a(4*c),0,c);break;default:return null}return d.length!==
c?d.subarray(0,c):d},freeType:function(a){b(a.buffer)}}}function la(a){return!!a&&"object"===typeof a&&Array.isArray(a.shape)&&Array.isArray(a.stride)&&"number"===typeof a.offset&&a.shape.length===a.stride.length&&(Array.isArray(a.data)||O(a.data))}function ib(a,b,c,e,f,d){for(var q=0;q<b;++q)for(var n=a[q],v=0;v<c;++v)for(var k=n[v],u=0;u<e;++u)f[d++]=k[u]}function jb(a,b,c,e,f){for(var d=1,q=c+1;q<b.length;++q)d*=b[q];var n=b[c];if(4===b.length-c){var v=b[c+1],k=b[c+2];b=b[c+3];for(q=0;q<n;++q)ib(a[q],
v,k,b,e,f),f+=d}else for(q=0;q<n;++q)jb(a[q],b,c+1,e,f),f+=d}function Ha(a){return Ia[Object.prototype.toString.call(a)]|0}function kb(a,b){for(var c=0;c<b.length;++c)a[c]=b[c]}function lb(a,b,c,e,f,d,q){for(var n=0,v=0;v<c;++v)for(var k=0;k<e;++k)a[n++]=b[f*v+d*k+q]}function Jb(a,b,c,e){function f(b){this.id=v++;this.buffer=a.createBuffer();this.type=b;this.usage=35044;this.byteLength=0;this.dimension=1;this.dtype=5121;this.persistentData=null;c.profile&&(this.stats={size:0})}function d(b,c,l){b.byteLength=
c.byteLength;a.bufferData(b.type,c,l)}function q(a,b,c,g,h,r){a.usage=c;if(Array.isArray(b)){if(a.dtype=g||5126,0<b.length)if(Array.isArray(b[0])){h=mb(b);for(var p=g=1;p<h.length;++p)g*=h[p];a.dimension=g;b=Ua(b,h,a.dtype);d(a,b,c);r?a.persistentData=b:G.freeType(b)}else"number"===typeof b[0]?(a.dimension=h,h=G.allocType(a.dtype,b.length),kb(h,b),d(a,h,c),r?a.persistentData=h:G.freeType(h)):O(b[0])&&(a.dimension=b[0].length,a.dtype=g||Ha(b[0])||5126,b=Ua(b,[b.length,b[0].length],a.dtype),d(a,b,c),
r?a.persistentData=b:G.freeType(b))}else if(O(b))a.dtype=g||Ha(b),a.dimension=h,d(a,b,c),r&&(a.persistentData=new Uint8Array(new Uint8Array(b.buffer)));else if(la(b)){h=b.shape;var e=b.stride,p=b.offset,t=0,ma=0,f=0,k=0;1===h.length?(t=h[0],ma=1,f=e[0],k=0):2===h.length&&(t=h[0],ma=h[1],f=e[0],k=e[1]);a.dtype=g||Ha(b.data)||5126;a.dimension=ma;h=G.allocType(a.dtype,t*ma);lb(h,b.data,t,ma,f,k,p);d(a,h,c);r?a.persistentData=h:G.freeType(h)}else b instanceof ArrayBuffer&&(a.dtype=5121,a.dimension=h,
d(a,b,c),r&&(a.persistentData=new Uint8Array(new Uint8Array(b))))}function n(c){b.bufferCount--;e(c);a.deleteBuffer(c.buffer);c.buffer=null;delete k[c.id]}var v=0,k={};f.prototype.bind=function(){a.bindBuffer(this.type,this.buffer)};f.prototype.destroy=function(){n(this)};var u=[];c.profile&&(b.getTotalBufferSize=function(){var a=0;Object.keys(k).forEach(function(b){a+=k[b].stats.size});return a});return{create:function(m,e,d,g){function h(b){var e=35044,t=null,d=0,m=0,f=1;Array.isArray(b)||O(b)||
la(b)||b instanceof ArrayBuffer?t=b:"number"===typeof b?d=b|0:b&&("data"in b&&(t=b.data),"usage"in b&&(e=nb[b.usage]),"type"in b&&(m=Ja[b.type]),"dimension"in b&&(f=b.dimension|0),"length"in b&&(d=b.length|0));r.bind();t?q(r,t,e,m,f,g):(d&&a.bufferData(r.type,d,e),r.dtype=m||5121,r.usage=e,r.dimension=f,r.byteLength=d);c.profile&&(r.stats.size=r.byteLength*na[r.dtype]);return h}b.bufferCount++;var r=new f(e);k[r.id]=r;d||h(m);h._reglType="buffer";h._buffer=r;h.subdata=function(b,c){var t=(c||0)|0,
d;r.bind();if(O(b)||b instanceof ArrayBuffer)a.bufferSubData(r.type,t,b);else if(Array.isArray(b)){if(0<b.length)if("number"===typeof b[0]){var e=G.allocType(r.dtype,b.length);kb(e,b);a.bufferSubData(r.type,t,e);G.freeType(e)}else if(Array.isArray(b[0])||O(b[0]))d=mb(b),e=Ua(b,d,r.dtype),a.bufferSubData(r.type,t,e),G.freeType(e)}else if(la(b)){d=b.shape;var m=b.stride,g=e=0,f=0,y=0;1===d.length?(e=d[0],g=1,f=m[0],y=0):2===d.length&&(e=d[0],g=d[1],f=m[0],y=m[1]);d=Array.isArray(b.data)?r.dtype:Ha(b.data);
d=G.allocType(d,e*g);lb(d,b.data,e,g,f,y,b.offset);a.bufferSubData(r.type,t,d);G.freeType(d)}return h};c.profile&&(h.stats=r.stats);h.destroy=function(){n(r)};return h},createStream:function(a,b){var c=u.pop();c||(c=new f(a));c.bind();q(c,b,35040,0,1,!1);return c},destroyStream:function(a){u.push(a)},clear:function(){I(k).forEach(n);u.forEach(n)},getBuffer:function(a){return a&&a._buffer instanceof f?a._buffer:null},restore:function(){I(k).forEach(function(b){b.buffer=a.createBuffer();a.bindBuffer(b.type,
b.buffer);a.bufferData(b.type,b.persistentData||b.byteLength,b.usage)})},_initBuffer:q}}function Kb(a,b,c,e){function f(a){this.id=v++;n[this.id]=this;this.buffer=a;this.primType=4;this.type=this.vertCount=0}function d(d,e,f,g,h,r,p){d.buffer.bind();var k;e?((k=p)||O(e)&&(!la(e)||O(e.data))||(k=b.oes_element_index_uint?5125:5123),c._initBuffer(d.buffer,e,f,k,3)):(a.bufferData(34963,r,f),d.buffer.dtype=k||5121,d.buffer.usage=f,d.buffer.dimension=3,d.buffer.byteLength=r);k=p;if(!p){switch(d.buffer.dtype){case 5121:case 5120:k=
5121;break;case 5123:case 5122:k=5123;break;case 5125:case 5124:k=5125}d.buffer.dtype=k}d.type=k;e=h;0>e&&(e=d.buffer.byteLength,5123===k?e>>=1:5125===k&&(e>>=2));d.vertCount=e;e=g;0>g&&(e=4,g=d.buffer.dimension,1===g&&(e=0),2===g&&(e=1),3===g&&(e=4));d.primType=e}function q(a){e.elementsCount--;delete n[a.id];a.buffer.destroy();a.buffer=null}var n={},v=0,k={uint8:5121,uint16:5123};b.oes_element_index_uint&&(k.uint32=5125);f.prototype.bind=function(){this.buffer.bind()};var u=[];return{create:function(a,
b){function l(a){if(a)if("number"===typeof a)g(a),h.primType=4,h.vertCount=a|0,h.type=5121;else{var b=null,c=35044,e=-1,f=-1,m=0,n=0;if(Array.isArray(a)||O(a)||la(a))b=a;else if("data"in a&&(b=a.data),"usage"in a&&(c=nb[a.usage]),"primitive"in a&&(e=Ka[a.primitive]),"count"in a&&(f=a.count|0),"type"in a&&(n=k[a.type]),"length"in a)m=a.length|0;else if(m=f,5123===n||5122===n)m*=2;else if(5125===n||5124===n)m*=4;d(h,b,c,e,f,m,n)}else g(),h.primType=4,h.vertCount=0,h.type=5121;return l}var g=c.create(null,
34963,!0),h=new f(g._buffer);e.elementsCount++;l(a);l._reglType="elements";l._elements=h;l.subdata=function(a,b){g.subdata(a,b);return l};l.destroy=function(){q(h)};return l},createStream:function(a){var b=u.pop();b||(b=new f(c.create(null,34963,!0,!1)._buffer));d(b,a,35040,-1,-1,0,0);return b},destroyStream:function(a){u.push(a)},getElements:function(a){return"function"===typeof a&&a._elements instanceof f?a._elements:null},clear:function(){I(n).forEach(q)}}}function ob(a){for(var b=G.allocType(5123,
a.length),c=0;c<a.length;++c)if(isNaN(a[c]))b[c]=65535;else if(Infinity===a[c])b[c]=31744;else if(-Infinity===a[c])b[c]=64512;else{pb[0]=a[c];var e=Lb[0],f=e>>>31<<15,d=(e<<1>>>24)-127,e=e>>13&1023;b[c]=-24>d?f:-14>d?f+(e+1024>>-14-d):15<d?f+31744:f+(d+15<<10)+e}return b}function ra(a){return Array.isArray(a)||O(a)}function sa(a){return"[object "+a+"]"}function qb(a){return Array.isArray(a)&&(0===a.length||"number"===typeof a[0])}function rb(a){return Array.isArray(a)&&0!==a.length&&ra(a[0])?!0:!1}
function aa(a){return Object.prototype.toString.call(a)}function Va(a){if(!a)return!1;var b=aa(a);return 0<=Mb.indexOf(b)?!0:qb(a)||rb(a)||la(a)}function sb(a,b){36193===a.type?(a.data=ob(b),G.freeType(b)):a.data=b}function La(a,b,c,e,f,d){a="undefined"!==typeof C[a]?C[a]:U[a]*za[b];d&&(a*=6);if(f){for(e=0;1<=c;)e+=a*c*c,c/=2;return e}return a*c*e}function Nb(a,b,c,e,f,d,q){function n(){this.format=this.internalformat=6408;this.type=5121;this.flipY=this.premultiplyAlpha=this.compressed=!1;this.unpackAlignment=
1;this.colorSpace=37444;this.channels=this.height=this.width=0}function v(a,b){a.internalformat=b.internalformat;a.format=b.format;a.type=b.type;a.compressed=b.compressed;a.premultiplyAlpha=b.premultiplyAlpha;a.flipY=b.flipY;a.unpackAlignment=b.unpackAlignment;a.colorSpace=b.colorSpace;a.width=b.width;a.height=b.height;a.channels=b.channels}function k(a,b){if("object"===typeof b&&b){"premultiplyAlpha"in b&&(a.premultiplyAlpha=b.premultiplyAlpha);"flipY"in b&&(a.flipY=b.flipY);"alignment"in b&&(a.unpackAlignment=
b.alignment);"colorSpace"in b&&(a.colorSpace=Ob[b.colorSpace]);"type"in b&&(a.type=N[b.type]);var c=a.width,e=a.height,d=a.channels,f=!1;"shape"in b?(c=b.shape[0],e=b.shape[1],3===b.shape.length&&(d=b.shape[2],f=!0)):("radius"in b&&(c=e=b.radius),"width"in b&&(c=b.width),"height"in b&&(e=b.height),"channels"in b&&(d=b.channels,f=!0));a.width=c|0;a.height=e|0;a.channels=d|0;c=!1;"format"in b&&(c=b.format,e=a.internalformat=E[c],a.format=V[e],c in N&&!("type"in b)&&(a.type=N[c]),c in ga&&(a.compressed=
!0),c=!0);!f&&c?a.channels=U[a.format]:f&&!c&&a.channels!==Oa[a.format]&&(a.format=a.internalformat=Oa[a.channels])}}function u(b){a.pixelStorei(37440,b.flipY);a.pixelStorei(37441,b.premultiplyAlpha);a.pixelStorei(37443,b.colorSpace);a.pixelStorei(3317,b.unpackAlignment)}function m(){n.call(this);this.yOffset=this.xOffset=0;this.data=null;this.needsFree=!1;this.element=null;this.needsCopy=!1}function x(a,b){var c=null;Va(b)?c=b:b&&(k(a,b),"x"in b&&(a.xOffset=b.x|0),"y"in b&&(a.yOffset=b.y|0),Va(b.data)&&
(c=b.data));if(b.copy){var e=f.viewportWidth,d=f.viewportHeight;a.width=a.width||e-a.xOffset;a.height=a.height||d-a.yOffset;a.needsCopy=!0}else if(!c)a.width=a.width||1,a.height=a.height||1,a.channels=a.channels||4;else if(O(c))a.channels=a.channels||4,a.data=c,"type"in b||5121!==a.type||(a.type=Ia[Object.prototype.toString.call(c)]|0);else if(qb(c)){a.channels=a.channels||4;e=c;d=e.length;switch(a.type){case 5121:case 5123:case 5125:case 5126:d=G.allocType(a.type,d);d.set(e);a.data=d;break;case 36193:a.data=
ob(e)}a.alignment=1;a.needsFree=!0}else if(la(c)){e=c.data;Array.isArray(e)||5121!==a.type||(a.type=Ia[Object.prototype.toString.call(e)]|0);var d=c.shape,h=c.stride,y,t,g,p;3===d.length?(g=d[2],p=h[2]):p=g=1;y=d[0];t=d[1];d=h[0];h=h[1];a.alignment=1;a.width=y;a.height=t;a.channels=g;a.format=a.internalformat=Oa[g];a.needsFree=!0;y=p;c=c.offset;g=a.width;p=a.height;t=a.channels;for(var z=G.allocType(36193===a.type?5126:a.type,g*p*t),B=0,ha=0;ha<p;++ha)for(var oa=0;oa<g;++oa)for(var Wa=0;Wa<t;++Wa)z[B++]=
e[d*oa+h*ha+y*Wa+c];sb(a,z)}else if(aa(c)===Xa||aa(c)===Ya||aa(c)===ub)aa(c)===Xa||aa(c)===Ya?a.element=c:a.element=c.canvas,a.width=a.element.width,a.height=a.element.height,a.channels=4;else if(aa(c)===vb)a.element=c,a.width=c.width,a.height=c.height,a.channels=4;else if(aa(c)===wb)a.element=c,a.width=c.naturalWidth,a.height=c.naturalHeight,a.channels=4;else if(aa(c)===xb)a.element=c,a.width=c.videoWidth,a.height=c.videoHeight,a.channels=4;else if(rb(c)){e=a.width||c[0].length;d=a.height||c.length;
h=a.channels;h=ra(c[0][0])?h||c[0][0].length:h||1;y=Qa.shape(c);g=1;for(p=0;p<y.length;++p)g*=y[p];g=G.allocType(36193===a.type?5126:a.type,g);Qa.flatten(c,y,"",g);sb(a,g);a.alignment=1;a.width=e;a.height=d;a.channels=h;a.format=a.internalformat=Oa[h];a.needsFree=!0}}function l(b,c,d,h,g){var y=b.element,f=b.data,p=b.internalformat,t=b.format,k=b.type,z=b.width,B=b.height;u(b);y?a.texSubImage2D(c,g,d,h,t,k,y):b.compressed?a.compressedTexSubImage2D(c,g,d,h,p,z,B,f):b.needsCopy?(e(),a.copyTexSubImage2D(c,
g,d,h,b.xOffset,b.yOffset,z,B)):a.texSubImage2D(c,g,d,h,z,B,t,k,f)}function g(){return R.pop()||new m}function h(a){a.needsFree&&G.freeType(a.data);m.call(a);R.push(a)}function r(){n.call(this);this.genMipmaps=!1;this.mipmapHint=4352;this.mipmask=0;this.images=Array(16)}function p(a,b,c){var d=a.images[0]=g();a.mipmask=1;d.width=a.width=b;d.height=a.height=c;d.channels=a.channels=4}function P(a,b){var c=null;if(Va(b))c=a.images[0]=g(),v(c,a),x(c,b),a.mipmask=1;else if(k(a,b),Array.isArray(b.mipmap))for(var d=
b.mipmap,e=0;e<d.length;++e)c=a.images[e]=g(),v(c,a),c.width>>=e,c.height>>=e,x(c,d[e]),a.mipmask|=1<<e;else c=a.images[0]=g(),v(c,a),x(c,b),a.mipmask=1;v(a,a.images[0])}function t(b,c){for(var d=b.images,h=0;h<d.length&&d[h];++h){var g=d[h],y=c,f=h,p=g.element,t=g.data,k=g.internalformat,z=g.format,B=g.type,ha=g.width,oa=g.height;u(g);p?a.texImage2D(y,f,z,z,B,p):g.compressed?a.compressedTexImage2D(y,f,k,ha,oa,0,t):g.needsCopy?(e(),a.copyTexImage2D(y,f,z,g.xOffset,g.yOffset,ha,oa,0)):a.texImage2D(y,
f,z,ha,oa,0,z,B,t||null)}}function ma(){var a=Y.pop()||new r;n.call(a);for(var b=a.mipmask=0;16>b;++b)a.images[b]=null;return a}function ya(a){for(var b=a.images,c=0;c<b.length;++c)b[c]&&h(b[c]),b[c]=null;Y.push(a)}function w(){this.magFilter=this.minFilter=9728;this.wrapT=this.wrapS=33071;this.anisotropic=1;this.genMipmaps=!1;this.mipmapHint=4352}function H(a,b){"min"in b&&(a.minFilter=Aa[b.min],0<=Pb.indexOf(a.minFilter)&&!("faces"in b)&&(a.genMipmaps=!0));"mag"in b&&(a.magFilter=S[b.mag]);var c=
a.wrapS,d=a.wrapT;if("wrap"in b){var e=b.wrap;"string"===typeof e?c=d=ia[e]:Array.isArray(e)&&(c=ia[e[0]],d=ia[e[1]])}else"wrapS"in b&&(c=ia[b.wrapS]),"wrapT"in b&&(d=ia[b.wrapT]);a.wrapS=c;a.wrapT=d;"anisotropic"in b&&(a.anisotropic=b.anisotropic);if("mipmap"in b){c=!1;switch(typeof b.mipmap){case "string":a.mipmapHint=A[b.mipmap];c=a.genMipmaps=!0;break;case "boolean":c=a.genMipmaps=b.mipmap;break;case "object":a.genMipmaps=!1,c=!0}!c||"min"in b||(a.minFilter=9984)}}function M(c,d){a.texParameteri(d,
10241,c.minFilter);a.texParameteri(d,10240,c.magFilter);a.texParameteri(d,10242,c.wrapS);a.texParameteri(d,10243,c.wrapT);b.ext_texture_filter_anisotropic&&a.texParameteri(d,34046,c.anisotropic);c.genMipmaps&&(a.hint(33170,c.mipmapHint),a.generateMipmap(d))}function y(b){n.call(this);this.mipmask=0;this.internalformat=6408;this.id=Qb++;this.refCount=1;this.target=b;this.texture=a.createTexture();this.unit=-1;this.bindCount=0;this.texInfo=new w;q.profile&&(this.stats={size:0})}function T(b){a.activeTexture(33984);
a.bindTexture(b.target,b.texture)}function wa(){var b=W[0];b?a.bindTexture(b.target,b.texture):a.bindTexture(3553,null)}function F(b){var c=b.texture,e=b.unit,g=b.target;0<=e&&(a.activeTexture(33984+e),a.bindTexture(g,null),W[e]=null);a.deleteTexture(c);b.texture=null;b.params=null;b.pixels=null;b.refCount=0;delete ea[b.id];d.textureCount--}var A={"don't care":4352,"dont care":4352,nice:4354,fast:4353},ia={repeat:10497,clamp:33071,mirror:33648},S={nearest:9728,linear:9729},Aa=L({mipmap:9987,"nearest mipmap nearest":9984,
"linear mipmap nearest":9985,"nearest mipmap linear":9986,"linear mipmap linear":9987},S),Ob={none:0,browser:37444},N={uint8:5121,rgba4:32819,rgb565:33635,"rgb5 a1":32820},E={alpha:6406,luminance:6409,"luminance alpha":6410,rgb:6407,rgba:6408,rgba4:32854,"rgb5 a1":32855,rgb565:36194},ga={};b.ext_srgb&&(E.srgb=35904,E.srgba=35906);b.oes_texture_float&&(N.float32=N["float"]=5126);b.oes_texture_half_float&&(N.float16=N["half float"]=36193);b.webgl_depth_texture&&(L(E,{depth:6402,"depth stencil":34041}),
L(N,{uint16:5123,uint32:5125,"depth stencil":34042}));b.webgl_compressed_texture_s3tc&&L(ga,{"rgb s3tc dxt1":33776,"rgba s3tc dxt1":33777,"rgba s3tc dxt3":33778,"rgba s3tc dxt5":33779});b.webgl_compressed_texture_atc&&L(ga,{"rgb atc":35986,"rgba atc explicit alpha":35987,"rgba atc interpolated alpha":34798});b.webgl_compressed_texture_pvrtc&&L(ga,{"rgb pvrtc 4bppv1":35840,"rgb pvrtc 2bppv1":35841,"rgba pvrtc 4bppv1":35842,"rgba pvrtc 2bppv1":35843});b.webgl_compressed_texture_etc1&&(ga["rgb etc1"]=
36196);var J=Array.prototype.slice.call(a.getParameter(34467));Object.keys(ga).forEach(function(a){var b=ga[a];0<=J.indexOf(b)&&(E[a]=b)});var C=Object.keys(E);c.textureFormats=C;var ca=[];Object.keys(E).forEach(function(a){ca[E[a]]=a});var K=[];Object.keys(N).forEach(function(a){K[N[a]]=a});var Fa=[];Object.keys(S).forEach(function(a){Fa[S[a]]=a});var pa=[];Object.keys(Aa).forEach(function(a){pa[Aa[a]]=a});var qa=[];Object.keys(ia).forEach(function(a){qa[ia[a]]=a});var V=C.reduce(function(a,c){var d=
E[c];6409===d||6406===d||6409===d||6410===d||6402===d||34041===d||b.ext_srgb&&(35904===d||35906===d)?a[d]=d:32855===d||0<=c.indexOf("rgba")?a[d]=6408:a[d]=6407;return a},{}),R=[],Y=[],Qb=0,ea={},fa=c.maxTextureUnits,W=Array(fa).map(function(){return null});L(y.prototype,{bind:function(){this.bindCount+=1;var b=this.unit;if(0>b){for(var c=0;c<fa;++c){var e=W[c];if(e){if(0<e.bindCount)continue;e.unit=-1}W[c]=this;b=c;break}q.profile&&d.maxTextureUnits<b+1&&(d.maxTextureUnits=b+1);this.unit=b;a.activeTexture(33984+
b);a.bindTexture(this.target,this.texture)}return b},unbind:function(){--this.bindCount},decRef:function(){0>=--this.refCount&&F(this)}});q.profile&&(d.getTotalTextureSize=function(){var a=0;Object.keys(ea).forEach(function(b){a+=ea[b].stats.size});return a});return{create2D:function(b,c){function e(a,b){var c=f.texInfo;w.call(c);var d=ma();"number"===typeof a?"number"===typeof b?p(d,a|0,b|0):p(d,a|0,a|0):a?(H(c,a),P(d,a)):p(d,1,1);c.genMipmaps&&(d.mipmask=(d.width<<1)-1);f.mipmask=d.mipmask;v(f,
d);f.internalformat=d.internalformat;e.width=d.width;e.height=d.height;T(f);t(d,3553);M(c,3553);wa();ya(d);q.profile&&(f.stats.size=La(f.internalformat,f.type,d.width,d.height,c.genMipmaps,!1));e.format=ca[f.internalformat];e.type=K[f.type];e.mag=Fa[c.magFilter];e.min=pa[c.minFilter];e.wrapS=qa[c.wrapS];e.wrapT=qa[c.wrapT];return e}var f=new y(3553);ea[f.id]=f;d.textureCount++;e(b,c);e.subimage=function(a,b,c,d){b|=0;c|=0;d|=0;var y=g();v(y,f);y.width=0;y.height=0;x(y,a);y.width=y.width||(f.width>>
d)-b;y.height=y.height||(f.height>>d)-c;T(f);l(y,3553,b,c,d);wa();h(y);return e};e.resize=function(b,c){var d=b|0,g=c|0||d;if(d===f.width&&g===f.height)return e;e.width=f.width=d;e.height=f.height=g;T(f);for(var y=0;f.mipmask>>y;++y){var h=d>>y,z=g>>y;if(!h||!z)break;a.texImage2D(3553,y,f.format,h,z,0,f.format,f.type,null)}wa();q.profile&&(f.stats.size=La(f.internalformat,f.type,d,g,!1,!1));return e};e._reglType="texture2d";e._texture=f;q.profile&&(e.stats=f.stats);e.destroy=function(){f.decRef()};
return e},createCube:function(b,c,e,f,n,r){function m(a,b,c,d,e,f){var g,da=A.texInfo;w.call(da);for(g=0;6>g;++g)F[g]=ma();if("number"===typeof a||!a)for(a=a|0||1,g=0;6>g;++g)p(F[g],a,a);else if("object"===typeof a)if(b)P(F[0],a),P(F[1],b),P(F[2],c),P(F[3],d),P(F[4],e),P(F[5],f);else if(H(da,a),k(A,a),"faces"in a)for(a=a.faces,g=0;6>g;++g)v(F[g],A),P(F[g],a[g]);else for(g=0;6>g;++g)P(F[g],a);v(A,F[0]);A.mipmask=da.genMipmaps?(F[0].width<<1)-1:F[0].mipmask;A.internalformat=F[0].internalformat;m.width=
F[0].width;m.height=F[0].height;T(A);for(g=0;6>g;++g)t(F[g],34069+g);M(da,34067);wa();q.profile&&(A.stats.size=La(A.internalformat,A.type,m.width,m.height,da.genMipmaps,!0));m.format=ca[A.internalformat];m.type=K[A.type];m.mag=Fa[da.magFilter];m.min=pa[da.minFilter];m.wrapS=qa[da.wrapS];m.wrapT=qa[da.wrapT];for(g=0;6>g;++g)ya(F[g]);return m}var A=new y(34067);ea[A.id]=A;d.cubeCount++;var F=Array(6);m(b,c,e,f,n,r);m.subimage=function(a,b,c,d,e){c|=0;d|=0;e|=0;var f=g();v(f,A);f.width=0;f.height=0;
x(f,b);f.width=f.width||(A.width>>e)-c;f.height=f.height||(A.height>>e)-d;T(A);l(f,34069+a,c,d,e);wa();h(f);return m};m.resize=function(b){b|=0;if(b!==A.width){m.width=A.width=b;m.height=A.height=b;T(A);for(var c=0;6>c;++c)for(var d=0;A.mipmask>>d;++d)a.texImage2D(34069+c,d,A.format,b>>d,b>>d,0,A.format,A.type,null);wa();q.profile&&(A.stats.size=La(A.internalformat,A.type,m.width,m.height,!1,!0));return m}};m._reglType="textureCube";m._texture=A;q.profile&&(m.stats=A.stats);m.destroy=function(){A.decRef()};
return m},clear:function(){for(var b=0;b<fa;++b)a.activeTexture(33984+b),a.bindTexture(3553,null),W[b]=null;I(ea).forEach(F);d.cubeCount=0;d.textureCount=0},getTexture:function(a){return null},restore:function(){for(var b=0;b<fa;++b){var c=W[b];c&&(c.bindCount=0,c.unit=-1,W[b]=null)}I(ea).forEach(function(b){b.texture=a.createTexture();a.bindTexture(b.target,b.texture);for(var c=0;32>c;++c)if(0!==(b.mipmask&1<<c))if(3553===b.target)a.texImage2D(3553,c,b.internalformat,b.width>>c,b.height>>c,0,b.internalformat,
b.type,null);else for(var d=0;6>d;++d)a.texImage2D(34069+d,c,b.internalformat,b.width>>c,b.height>>c,0,b.internalformat,b.type,null);M(b.texInfo,b.target)})},refresh:function(){for(var b=0;b<fa;++b){var c=W[b];c&&(c.bindCount=0,c.unit=-1,W[b]=null);a.activeTexture(33984+b);a.bindTexture(3553,null);a.bindTexture(34067,null)}}}}function Rb(a,b,c,e,f,d){function q(a,b,c){this.target=a;this.texture=b;this.renderbuffer=c;var d=a=0;b?(a=b.width,d=b.height):c&&(a=c.width,d=c.height);this.width=a;this.height=
d}function n(a){a&&(a.texture&&a.texture._texture.decRef(),a.renderbuffer&&a.renderbuffer._renderbuffer.decRef())}function v(a,b,c){a&&(a.texture?a.texture._texture.refCount+=1:a.renderbuffer._renderbuffer.refCount+=1)}function k(b,c){c&&(c.texture?a.framebufferTexture2D(36160,b,c.target,c.texture._texture.texture,0):a.framebufferRenderbuffer(36160,b,36161,c.renderbuffer._renderbuffer.renderbuffer))}function u(a){var b=3553,c=null,d=null,e=a;"object"===typeof a&&(e=a.data,"target"in a&&(b=a.target|
0));a=e._reglType;"texture2d"===a?c=e:"textureCube"===a?c=e:"renderbuffer"===a&&(d=e,b=36161);return new q(b,c,d)}function m(a,b,c,d,g){if(c)return a=e.create2D({width:a,height:b,format:d,type:g}),a._texture.refCount=0,new q(3553,a,null);a=f.create({width:a,height:b,format:d});a._renderbuffer.refCount=0;return new q(36161,null,a)}function x(a){return a&&(a.texture||a.renderbuffer)}function l(a,b,c){a&&(a.texture?a.texture.resize(b,c):a.renderbuffer&&a.renderbuffer.resize(b,c),a.width=b,a.height=c)}
function g(){this.id=H++;M[this.id]=this;this.framebuffer=a.createFramebuffer();this.height=this.width=0;this.colorAttachments=[];this.depthStencilAttachment=this.stencilAttachment=this.depthAttachment=null}function h(a){a.colorAttachments.forEach(n);n(a.depthAttachment);n(a.stencilAttachment);n(a.depthStencilAttachment)}function r(b){a.deleteFramebuffer(b.framebuffer);b.framebuffer=null;d.framebufferCount--;delete M[b.id]}function p(b){var d;a.bindFramebuffer(36160,b.framebuffer);var e=b.colorAttachments;
for(d=0;d<e.length;++d)k(36064+d,e[d]);for(d=e.length;d<c.maxColorAttachments;++d)a.framebufferTexture2D(36160,36064+d,3553,null,0);a.framebufferTexture2D(36160,33306,3553,null,0);a.framebufferTexture2D(36160,36096,3553,null,0);a.framebufferTexture2D(36160,36128,3553,null,0);k(36096,b.depthAttachment);k(36128,b.stencilAttachment);k(33306,b.depthStencilAttachment);a.checkFramebufferStatus(36160);a.isContextLost();a.bindFramebuffer(36160,t.next?t.next.framebuffer:null);t.cur=t.next;a.getError()}function P(a,
b){function c(a,b){var d,g=0,f=0,t=!0,k=!0;d=null;var l=!0,n="rgba",r="uint8",y=1,q=null,P=null,pa=null,M=!1;if("number"===typeof a)g=a|0,f=b|0||g;else if(a){"shape"in a?(f=a.shape,g=f[0],f=f[1]):("radius"in a&&(g=f=a.radius),"width"in a&&(g=a.width),"height"in a&&(f=a.height));if("color"in a||"colors"in a)d=a.color||a.colors,Array.isArray(d);if(!d){"colorCount"in a&&(y=a.colorCount|0);"colorTexture"in a&&(l=!!a.colorTexture,n="rgba4");if("colorType"in a&&(r=a.colorType,!l))if("half float"===r||"float16"===
r)n="rgba16f";else if("float"===r||"float32"===r)n="rgba32f";"colorFormat"in a&&(n=a.colorFormat,0<=ma.indexOf(n)?l=!0:0<=ya.indexOf(n)&&(l=!1))}if("depthTexture"in a||"depthStencilTexture"in a)M=!(!a.depthTexture&&!a.depthStencilTexture);"depth"in a&&("boolean"===typeof a.depth?t=a.depth:(q=a.depth,k=!1));"stencil"in a&&("boolean"===typeof a.stencil?k=a.stencil:(P=a.stencil,t=!1));"depthStencil"in a&&("boolean"===typeof a.depthStencil?t=k=a.depthStencil:(pa=a.depthStencil,k=t=!1))}else g=f=1;var V=
null,H=null,T=null,w=null;if(Array.isArray(d))V=d.map(u);else if(d)V=[u(d)];else for(V=Array(y),d=0;d<y;++d)V[d]=m(g,f,l,n,r);g=g||V[0].width;f=f||V[0].height;q?H=u(q):t&&!k&&(H=m(g,f,M,"depth","uint32"));P?T=u(P):k&&!t&&(T=m(g,f,!1,"stencil","uint8"));pa?w=u(pa):!q&&!P&&k&&t&&(w=m(g,f,M,"depth stencil","depth stencil"));t=null;for(d=0;d<V.length;++d)v(V[d],g,f),V[d]&&V[d].texture&&(k=Za[V[d].texture._texture.format]*Ra[V[d].texture._texture.type],null===t&&(t=k));v(H,g,f);v(T,g,f);v(w,g,f);h(e);
e.width=g;e.height=f;e.colorAttachments=V;e.depthAttachment=H;e.stencilAttachment=T;e.depthStencilAttachment=w;c.color=V.map(x);c.depth=x(H);c.stencil=x(T);c.depthStencil=x(w);c.width=e.width;c.height=e.height;p(e);return c}var e=new g;d.framebufferCount++;c(a,b);return L(c,{resize:function(a,b){var d=Math.max(a|0,1),g=Math.max(b|0||d,1);if(d===e.width&&g===e.height)return c;for(var f=e.colorAttachments,h=0;h<f.length;++h)l(f[h],d,g);l(e.depthAttachment,d,g);l(e.stencilAttachment,d,g);l(e.depthStencilAttachment,
d,g);e.width=c.width=d;e.height=c.height=g;p(e);return c},_reglType:"framebuffer",_framebuffer:e,destroy:function(){r(e);h(e)},use:function(a){t.setFBO({framebuffer:c},a)}})}var t={cur:null,next:null,dirty:!1,setFBO:null},ma=["rgba"],ya=["rgba4","rgb565","rgb5 a1"];b.ext_srgb&&ya.push("srgba");b.ext_color_buffer_half_float&&ya.push("rgba16f","rgb16f");b.webgl_color_buffer_float&&ya.push("rgba32f");var w=["uint8"];b.oes_texture_half_float&&w.push("half float","float16");b.oes_texture_float&&w.push("float",
"float32");var H=0,M={};return L(t,{getFramebuffer:function(a){return"function"===typeof a&&"framebuffer"===a._reglType&&(a=a._framebuffer,a instanceof g)?a:null},create:P,createCube:function(a){function b(a){var d,g={color:null},f=0,h=null;d="rgba";var t="uint8",p=1;if("number"===typeof a)f=a|0;else if(a){"shape"in a?f=a.shape[0]:("radius"in a&&(f=a.radius|0),"width"in a?f=a.width|0:"height"in a&&(f=a.height|0));if("color"in a||"colors"in a)h=a.color||a.colors,Array.isArray(h);h||("colorCount"in
a&&(p=a.colorCount|0),"colorType"in a&&(t=a.colorType),"colorFormat"in a&&(d=a.colorFormat));"depth"in a&&(g.depth=a.depth);"stencil"in a&&(g.stencil=a.stencil);"depthStencil"in a&&(g.depthStencil=a.depthStencil)}else f=1;if(h)if(Array.isArray(h))for(a=[],d=0;d<h.length;++d)a[d]=h[d];else a=[h];else for(a=Array(p),h={radius:f,format:d,type:t},d=0;d<p;++d)a[d]=e.createCube(h);g.color=Array(a.length);for(d=0;d<a.length;++d)p=a[d],f=f||p.width,g.color[d]={target:34069,data:a[d]};for(d=0;6>d;++d){for(p=
0;p<a.length;++p)g.color[p].target=34069+d;0<d&&(g.depth=c[0].depth,g.stencil=c[0].stencil,g.depthStencil=c[0].depthStencil);if(c[d])c[d](g);else c[d]=P(g)}return L(b,{width:f,height:f,color:a})}var c=Array(6);b(a);return L(b,{faces:c,resize:function(a){var d=a|0;if(d===b.width)return b;var e=b.color;for(a=0;a<e.length;++a)e[a].resize(d);for(a=0;6>a;++a)c[a].resize(d);b.width=b.height=d;return b},_reglType:"framebufferCube",destroy:function(){c.forEach(function(a){a.destroy()})}})},clear:function(){I(M).forEach(r)},
restore:function(){t.cur=null;t.next=null;t.dirty=!0;I(M).forEach(function(b){b.framebuffer=a.createFramebuffer();p(b)})}})}function $a(){this.w=this.z=this.y=this.x=this.state=0;this.buffer=null;this.size=0;this.normalized=!1;this.type=5126;this.divisor=this.stride=this.offset=0}function Sb(a,b,c,e,f,d,q){function n(a){if(a!==r.currentVAO){var c=b.oes_vertex_array_object;a?c.bindVertexArrayOES(a.vao):c.bindVertexArrayOES(null);r.currentVAO=a}}function v(c){if(c!==r.currentVAO){if(c)c.bindAttrs();
else{for(var d=b.angle_instanced_arrays,e=0;e<l.length;++e){var g=l[e];g.buffer?(a.enableVertexAttribArray(e),g.buffer.bind(),a.vertexAttribPointer(e,g.size,g.type,g.normalized,g.stride,g.offfset),d&&g.divisor&&d.vertexAttribDivisorANGLE(e,g.divisor)):(a.disableVertexAttribArray(e),a.vertexAttrib4f(e,g.x,g.y,g.z,g.w))}q.elements?a.bindBuffer(34963,q.elements.buffer.buffer):a.bindBuffer(34963,null)}r.currentVAO=c}}function k(){I(h).forEach(function(a){a.destroy()})}function u(){this.id=++g;this.attributes=
[];this.elements=null;this.ownsElements=!1;this.offset=this.count=0;this.instances=-1;this.primitive=4;var a=b.oes_vertex_array_object;this.vao=a?a.createVertexArrayOES():null;h[this.id]=this;this.buffers=[]}function m(){b.oes_vertex_array_object&&I(h).forEach(function(a){a.refresh()})}var x=c.maxAttributes,l=Array(x);for(c=0;c<x;++c)l[c]=new $a;var g=0,h={},r={Record:$a,scope:{},state:l,currentVAO:null,targetVAO:null,restore:b.oes_vertex_array_object?m:function(){},createVAO:function(a){function b(a){var e;
Array.isArray(a)?(e=a,c.elements&&c.ownsElements&&c.elements.destroy(),c.elements=null,c.ownsElements=!1,c.offset=0,c.count=0,c.instances=-1,c.primitive=4):(a.elements?(e=a.elements,c.ownsElements?("function"===typeof e&&"elements"===e._reglType?c.elements.destroy():c.elements(e),c.ownsElements=!1):d.getElements(a.elements)?(c.elements=a.elements,c.ownsElements=!1):(c.elements=d.create(a.elements),c.ownsElements=!0)):(c.elements=null,c.ownsElements=!1),e=a.attributes,c.offset=0,c.count=-1,c.instances=
-1,c.primitive=4,c.elements&&(c.count=c.elements._elements.vertCount,c.primitive=c.elements._elements.primType),"offset"in a&&(c.offset=a.offset|0),"count"in a&&(c.count=a.count|0),"instances"in a&&(c.instances=a.instances|0),"primitive"in a&&(c.primitive=Ka[a.primitive]));a={};var g=c.attributes;g.length=e.length;for(var h=0;h<e.length;++h){var p=e[h],k=g[h]=new $a,m=p.data||p;if(Array.isArray(m)||O(m)||la(m)){var l;c.buffers[h]&&(l=c.buffers[h],O(m)&&l._buffer.byteLength>=m.byteLength?l.subdata(m):
(l.destroy(),c.buffers[h]=null));c.buffers[h]||(l=c.buffers[h]=f.create(p,34962,!1,!0));k.buffer=f.getBuffer(l);k.size=k.buffer.dimension|0;k.normalized=!1;k.type=k.buffer.dtype;k.offset=0;k.stride=0;k.divisor=0;k.state=1;a[h]=1}else f.getBuffer(p)?(k.buffer=f.getBuffer(p),k.size=k.buffer.dimension|0,k.normalized=!1,k.type=k.buffer.dtype,k.offset=0,k.stride=0,k.divisor=0,k.state=1):f.getBuffer(p.buffer)?(k.buffer=f.getBuffer(p.buffer),k.size=(+p.size||k.buffer.dimension)|0,k.normalized=!!p.normalized||
!1,k.type="type"in p?Ja[p.type]:k.buffer.dtype,k.offset=(p.offset||0)|0,k.stride=(p.stride||0)|0,k.divisor=(p.divisor||0)|0,k.state=1):"x"in p&&(k.x=+p.x||0,k.y=+p.y||0,k.z=+p.z||0,k.w=+p.w||0,k.state=2)}for(l=0;l<c.buffers.length;++l)!a[l]&&c.buffers[l]&&(c.buffers[l].destroy(),c.buffers[l]=null);c.refresh();return b}var c=new u;e.vaoCount+=1;b.destroy=function(){for(var a=0;a<c.buffers.length;++a)c.buffers[a]&&c.buffers[a].destroy();c.buffers.length=0;c.ownsElements&&(c.elements.destroy(),c.elements=
null,c.ownsElements=!1);c.destroy()};b._vao=c;b._reglType="vao";return b(a)},getVAO:function(a){return"function"===typeof a&&a._vao?a._vao:null},destroyBuffer:function(b){for(var c=0;c<l.length;++c){var d=l[c];d.buffer===b&&(a.disableVertexAttribArray(c),d.buffer=null)}},setVAO:b.oes_vertex_array_object?n:v,clear:b.oes_vertex_array_object?k:function(){}};u.prototype.bindAttrs=function(){for(var c=b.angle_instanced_arrays,e=this.attributes,g=0;g<e.length;++g){var f=e[g];f.buffer?(a.enableVertexAttribArray(g),
a.bindBuffer(34962,f.buffer.buffer),a.vertexAttribPointer(g,f.size,f.type,f.normalized,f.stride,f.offset),c&&f.divisor&&c.vertexAttribDivisorANGLE(g,f.divisor)):(a.disableVertexAttribArray(g),a.vertexAttrib4f(g,f.x,f.y,f.z,f.w))}for(c=e.length;c<x;++c)a.disableVertexAttribArray(c);(c=d.getElements(this.elements))?a.bindBuffer(34963,c.buffer.buffer):a.bindBuffer(34963,null)};u.prototype.refresh=function(){var a=b.oes_vertex_array_object;a&&(a.bindVertexArrayOES(this.vao),this.bindAttrs(),r.currentVAO=
null,a.bindVertexArrayOES(null))};u.prototype.destroy=function(){if(this.vao){var a=b.oes_vertex_array_object;this===r.currentVAO&&(r.currentVAO=null,a.bindVertexArrayOES(null));a.deleteVertexArrayOES(this.vao);this.vao=null}this.ownsElements&&(this.elements.destroy(),this.elements=null,this.ownsElements=!1);h[this.id]&&(delete h[this.id],--e.vaoCount)};return r}function Tb(a,b,c,e){function f(a,b,c,d){this.name=a;this.id=b;this.location=c;this.info=d}function d(a,b){for(var c=0;c<a.length;++c)if(a[c].id===
b.id){a[c].location=b.location;return}a.push(b)}function q(c,d,e){e=35632===c?k:u;var f=e[d];if(!f){var m=b.str(d),f=a.createShader(c);a.shaderSource(f,m);a.compileShader(f);e[d]=f}return f}function n(a,b){this.id=l++;this.fragId=a;this.vertId=b;this.program=null;this.uniforms=[];this.attributes=[];this.refCount=1;e.profile&&(this.stats={uniformsCount:0,attributesCount:0})}function v(c,h,k){var m;m=q(35632,c.fragId);var l=q(35633,c.vertId);h=c.program=a.createProgram();a.attachShader(h,m);a.attachShader(h,
l);if(k)for(m=0;m<k.length;++m)l=k[m],a.bindAttribLocation(h,l[0],l[1]);a.linkProgram(h);l=a.getProgramParameter(h,35718);e.profile&&(c.stats.uniformsCount=l);var n=c.uniforms;for(m=0;m<l;++m)if(k=a.getActiveUniform(h,m)){if(1<k.size)for(var v=0;v<k.size;++v){var u=k.name.replace("[0]","["+v+"]");d(n,new f(u,b.id(u),a.getUniformLocation(h,u),k))}v=k.name;1<k.size&&(v=v.replace("[0]",""));d(n,new f(v,b.id(v),a.getUniformLocation(h,v),k))}l=a.getProgramParameter(h,35721);e.profile&&(c.stats.attributesCount=
l);c=c.attributes;for(m=0;m<l;++m)(k=a.getActiveAttrib(h,m))&&d(c,new f(k.name,b.id(k.name),a.getAttribLocation(h,k.name),k))}var k={},u={},m={},x=[],l=0;e.profile&&(c.getMaxUniformsCount=function(){var a=0;x.forEach(function(b){b.stats.uniformsCount>a&&(a=b.stats.uniformsCount)});return a},c.getMaxAttributesCount=function(){var a=0;x.forEach(function(b){b.stats.attributesCount>a&&(a=b.stats.attributesCount)});return a});return{clear:function(){var b=a.deleteShader.bind(a);I(k).forEach(b);k={};I(u).forEach(b);
u={};x.forEach(function(b){a.deleteProgram(b.program)});x.length=0;m={};c.shaderCount=0},program:function(b,d,e,f){var l=m[d];l||(l=m[d]={});var q=l[b];if(q&&(q.refCount++,!f))return q;var w=new n(d,b);c.shaderCount++;v(w,e,f);q||(l[b]=w);x.push(w);return L(w,{destroy:function(){w.refCount--;if(0>=w.refCount){a.deleteProgram(w.program);var b=x.indexOf(w);x.splice(b,1);c.shaderCount--}0>=l[w.vertId].refCount&&(a.deleteShader(u[w.vertId]),delete u[w.vertId],delete m[w.fragId][w.vertId]);Object.keys(m[w.fragId]).length||
(a.deleteShader(k[w.fragId]),delete k[w.fragId],delete m[w.fragId])}})},restore:function(){k={};u={};for(var a=0;a<x.length;++a)v(x[a],null,x[a].attributes.map(function(a){return[a.location,a.name]}))},shader:q,frag:-1,vert:-1}}function Ub(a,b,c,e,f,d,q){function n(d){var f;f=null===b.next?5121:b.next.colorAttachments[0].texture._texture.type;var m=0,n=0,l=e.framebufferWidth,g=e.framebufferHeight,h=null;O(d)?h=d:d&&(m=d.x|0,n=d.y|0,l=(d.width||e.framebufferWidth-m)|0,g=(d.height||e.framebufferHeight-
n)|0,h=d.data||null);c();d=l*g*4;h||(5121===f?h=new Uint8Array(d):5126===f&&(h=h||new Float32Array(d)));a.pixelStorei(3333,4);a.readPixels(m,n,l,g,6408,f,h);return h}function v(a){var c;b.setFBO({framebuffer:a.framebuffer},function(){c=n(a)});return c}return function(a){return a&&"framebuffer"in a?v(a):n(a)}}function Ba(a){return Array.prototype.slice.call(a)}function Ca(a){return Ba(a).join("")}function Vb(){function a(){var a=[],b=[];return L(function(){a.push.apply(a,Ba(arguments))},{def:function(){var d=
"v"+c++;b.push(d);0<arguments.length&&(a.push(d,"="),a.push.apply(a,Ba(arguments)),a.push(";"));return d},toString:function(){return Ca([0<b.length?"var "+b.join(",")+";":"",Ca(a)])}})}function b(){function b(a,e){d(a,e,"=",c.def(a,e),";")}var c=a(),d=a(),e=c.toString,f=d.toString;return L(function(){c.apply(c,Ba(arguments))},{def:c.def,entry:c,exit:d,save:b,set:function(a,d,e){b(a,d);c(a,d,"=",e,";")},toString:function(){return e()+f()}})}var c=0,e=[],f=[],d=a(),q={};return{global:d,link:function(a){for(var b=
0;b<f.length;++b)if(f[b]===a)return e[b];b="g"+c++;e.push(b);f.push(a);return b},block:a,proc:function(a,c){function d(){var a="a"+e.length;e.push(a);return a}var e=[];c=c||0;for(var f=0;f<c;++f)d();var f=b(),x=f.toString;return q[a]=L(f,{arg:d,toString:function(){return Ca(["function(",e.join(),"){",x(),"}"])}})},scope:b,cond:function(){var a=Ca(arguments),c=b(),d=b(),e=c.toString,f=d.toString;return L(c,{then:function(){c.apply(c,Ba(arguments));return this},"else":function(){d.apply(d,Ba(arguments));
return this},toString:function(){var b=f();b&&(b="else{"+b+"}");return Ca(["if(",a,"){",e(),"}",b])}})},compile:function(){var a=['"use strict";',d,"return {"];Object.keys(q).forEach(function(b){a.push('"',b,'":',q[b].toString(),",")});a.push("}");var b=Ca(a).replace(/;/g,";\n").replace(/}/g,"}\n").replace(/{/g,"{\n");return Function.apply(null,e.concat(b)).apply(null,f)}}}function Sa(a){return Array.isArray(a)||O(a)||la(a)}function yb(a){return a.sort(function(a,c){return"viewport"===a?-1:"viewport"===
c?1:a<c?-1:1})}function J(a,b,c,e){this.thisDep=a;this.contextDep=b;this.propDep=c;this.append=e}function xa(a){return a&&!(a.thisDep||a.contextDep||a.propDep)}function w(a){return new J(!1,!1,!1,a)}function K(a,b){var c=a.type;if(0===c)return c=a.data.length,new J(!0,1<=c,2<=c,b);if(4===c)return c=a.data,new J(c.thisDep,c.contextDep,c.propDep,b);if(5===c)return new J(!1,!1,!1,b);if(6===c){for(var e=c=!1,f=!1,d=0;d<a.data.length;++d){var q=a.data[d];1===q.type?f=!0:2===q.type?e=!0:3===q.type?c=!0:
0===q.type?(c=!0,q=q.data,1<=q&&(e=!0),2<=q&&(f=!0)):4===q.type&&(c=c||q.data.thisDep,e=e||q.data.contextDep,f=f||q.data.propDep)}return new J(c,e,f,b)}return new J(3===c,2===c,1===c,b)}function Wb(a,b,c,e,f,d,q,n,v,k,u,m,x,l,g){function h(a){return a.replace(".","_")}function r(a,b,c){var d=h(a);Na.push(a);Ea[d]=ta[d]=!!c;ua[d]=b}function p(a,b,c){var d=h(a);Na.push(a);Array.isArray(c)?(ta[d]=c.slice(),Ea[d]=c.slice()):ta[d]=Ea[d]=c;va[d]=b}function P(){var a=Vb(),c=a.link,d=a.global;a.id=sa++;a.batchId=
"0";var e=c(tb),f=a.shared={props:"a0"};Object.keys(tb).forEach(function(a){f[a]=d.def(e,".",a)});var g=a.next={},da=a.current={};Object.keys(va).forEach(function(a){Array.isArray(ta[a])&&(g[a]=d.def(f.next,".",a),da[a]=d.def(f.current,".",a))});var D=a.constants={};Object.keys(Pa).forEach(function(a){D[a]=d.def(JSON.stringify(Pa[a]))});a.invoke=function(b,d){switch(d.type){case 0:var e=["this",f.context,f.props,a.batchId];return b.def(c(d.data),".call(",e.slice(0,Math.max(d.data.length+1,4)),")");
case 1:return b.def(f.props,d.data);case 2:return b.def(f.context,d.data);case 3:return b.def("this",d.data);case 4:return d.data.append(a,b),d.data.ref;case 5:return d.data.toString();case 6:return d.data.map(function(c){return a.invoke(b,c)})}};a.attribCache={};var ba={};a.scopeAttrib=function(a){a=b.id(a);if(a in ba)return ba[a];var d=k.scope[a];d||(d=k.scope[a]=new ea);return ba[a]=c(d)};return a}function t(a){var b=a["static"];a=a.dynamic;var c;if("profile"in b){var d=!!b.profile;c=w(function(a,
b){return d});c.enable=d}else if("profile"in a){var e=a.profile;c=K(e,function(a,b){return a.invoke(b,e)})}return c}function G(a,b){var c=a["static"],d=a.dynamic;if("framebuffer"in c){var e=c.framebuffer;return e?(e=n.getFramebuffer(e),w(function(a,b){var c=a.link(e),d=a.shared;b.set(d.framebuffer,".next",c);d=d.context;b.set(d,".framebufferWidth",c+".width");b.set(d,".framebufferHeight",c+".height");return c})):w(function(a,b){var c=a.shared;b.set(c.framebuffer,".next","null");c=c.context;b.set(c,
".framebufferWidth",c+".drawingBufferWidth");b.set(c,".framebufferHeight",c+".drawingBufferHeight");return"null"})}if("framebuffer"in d){var f=d.framebuffer;return K(f,function(a,b){var c=a.invoke(b,f),d=a.shared,e=d.framebuffer,c=b.def(e,".getFramebuffer(",c,")");b.set(e,".next",c);d=d.context;b.set(d,".framebufferWidth",c+"?"+c+".width:"+d+".drawingBufferWidth");b.set(d,".framebufferHeight",c+"?"+c+".height:"+d+".drawingBufferHeight");return c})}return null}function C(a,b,c){function d(a){if(a in
e){var c=e[a];a=!0;var z=c.x|0,g=c.y|0,h,da;"width"in c?h=c.width|0:a=!1;"height"in c?da=c.height|0:a=!1;return new J(!a&&b&&b.thisDep,!a&&b&&b.contextDep,!a&&b&&b.propDep,function(a,b){var d=a.shared.context,e=h;"width"in c||(e=b.def(d,".","framebufferWidth","-",z));var f=da;"height"in c||(f=b.def(d,".","framebufferHeight","-",g));return[z,g,e,f]})}if(a in f){var ha=f[a];a=K(ha,function(a,b){var c=a.invoke(b,ha),d=a.shared.context,e=b.def(c,".x|0"),f=b.def(c,".y|0"),z=b.def('"width" in ',c,"?",c,
".width|0:","(",d,".","framebufferWidth","-",e,")"),c=b.def('"height" in ',c,"?",c,".height|0:","(",d,".","framebufferHeight","-",f,")");return[e,f,z,c]});b&&(a.thisDep=a.thisDep||b.thisDep,a.contextDep=a.contextDep||b.contextDep,a.propDep=a.propDep||b.propDep);return a}return b?new J(b.thisDep,b.contextDep,b.propDep,function(a,b){var c=a.shared.context;return[0,0,b.def(c,".","framebufferWidth"),b.def(c,".","framebufferHeight")]}):null}var e=a["static"],f=a.dynamic;if(a=d("viewport")){var g=a;a=new J(a.thisDep,
a.contextDep,a.propDep,function(a,b){var c=g.append(a,b),d=a.shared.context;b.set(d,".viewportWidth",c[2]);b.set(d,".viewportHeight",c[3]);return c})}return{viewport:a,scissor_box:d("scissor.box")}}function O(a,b){var c=a["static"];if("string"===typeof c.frag&&"string"===typeof c.vert){if(0<Object.keys(b.dynamic).length)return null;var c=b["static"],d=Object.keys(c);if(0<d.length&&"number"===typeof c[d[0]]){for(var e=[],f=0;f<d.length;++f)e.push([c[d[f]]|0,d[f]]);return e}}return null}function H(a,
c,d){function e(a){if(a in f){var c=b.id(f[a]);a=w(function(){return c});a.id=c;return a}if(a in g){var d=g[a];return K(d,function(a,b){var c=a.invoke(b,d);return b.def(a.shared.strings,".id(",c,")")})}return null}var f=a["static"],g=a.dynamic,h=e("frag"),D=e("vert"),ba=null;xa(h)&&xa(D)?(ba=u.program(D.id,h.id,null,d),a=w(function(a,b){return a.link(ba)})):a=new J(h&&h.thisDep||D&&D.thisDep,h&&h.contextDep||D&&D.contextDep,h&&h.propDep||D&&D.propDep,function(a,b){var c=a.shared.shader,d;d=h?h.append(a,
b):b.def(c,".","frag");var e;e=D?D.append(a,b):b.def(c,".","vert");return b.def(c+".program("+e+","+d+")")});return{frag:h,vert:D,progVar:a,program:ba}}function M(a,b){function c(a,b){if(a in e){var d=e[a]|0;b?g.offset=d:g.instances=d;return w(function(a,c){b&&(a.OFFSET=d);return d})}if(a in f){var z=f[a];return K(z,function(a,c){var d=a.invoke(c,z);b&&(a.OFFSET=d);return d})}if(b){if(ba)return w(function(a,b){return a.OFFSET=0});if(h)return new J(D.thisDep,D.contextDep,D.propDep,function(a,b){return b.def(a.shared.vao+
".currentVAO?"+a.shared.vao+".currentVAO.offset:0")})}else if(h)return new J(D.thisDep,D.contextDep,D.propDep,function(a,b){return b.def(a.shared.vao+".currentVAO?"+a.shared.vao+".currentVAO.instances:-1")});return null}var e=a["static"],f=a.dynamic,g={},h=!1,D=function(){if("vao"in e){var a=e.vao;null!==a&&null===k.getVAO(a)&&(a=k.createVAO(a));h=!0;g.vao=a;return w(function(b){var c=k.getVAO(a);return c?b.link(c):"null"})}if("vao"in f){h=!0;var b=f.vao;return K(b,function(a,c){var d=a.invoke(c,
b);return c.def(a.shared.vao+".getVAO("+d+")")})}return null}(),ba=!1,X=function(){if("elements"in e){var a=e.elements;g.elements=a;if(Sa(a)){var b=g.elements=d.create(a,!0),a=d.getElements(b);ba=!0}else a&&(a=d.getElements(a),ba=!0);b=w(function(b,c){if(a){var d=b.link(a);return b.ELEMENTS=d}return b.ELEMENTS=null});b.value=a;return b}if("elements"in f){ba=!0;var c=f.elements;return K(c,function(a,b){var d=a.shared,e=d.isBufferArgs,d=d.elements,f=a.invoke(b,c),z=b.def("null"),e=b.def(e,"(",f,")"),
f=a.cond(e).then(z,"=",d,".createStream(",f,");")["else"](z,"=",d,".getElements(",f,");");b.entry(f);b.exit(a.cond(e).then(d,".destroyStream(",z,");"));return a.ELEMENTS=z})}return h?new J(D.thisDep,D.contextDep,D.propDep,function(a,b){return b.def(a.shared.vao+".currentVAO?"+a.shared.elements+".getElements("+a.shared.vao+".currentVAO.elements):null")}):null}(),ja=c("offset",!0),m=function(){if("primitive"in e){var a=e.primitive;g.primitive=a;return w(function(b,c){return Ka[a]})}if("primitive"in
f){var b=f.primitive;return K(b,function(a,c){var d=a.constants.primTypes,e=a.invoke(c,b);return c.def(d,"[",e,"]")})}return ba?xa(X)?X.value?w(function(a,b){return b.def(a.ELEMENTS,".primType")}):w(function(){return 4}):new J(X.thisDep,X.contextDep,X.propDep,function(a,b){var c=a.ELEMENTS;return b.def(c,"?",c,".primType:",4)}):h?new J(D.thisDep,D.contextDep,D.propDep,function(a,b){return b.def(a.shared.vao+".currentVAO?"+a.shared.vao+".currentVAO.primitive:4")}):null}(),l=function(){if("count"in
e){var a=e.count|0;g.count=a;return w(function(){return a})}if("count"in f){var b=f.count;return K(b,function(a,c){return a.invoke(c,b)})}return ba?xa(X)?X?ja?new J(ja.thisDep,ja.contextDep,ja.propDep,function(a,b){return b.def(a.ELEMENTS,".vertCount-",a.OFFSET)}):w(function(a,b){return b.def(a.ELEMENTS,".vertCount")}):w(function(){return-1}):new J(X.thisDep||ja.thisDep,X.contextDep||ja.contextDep,X.propDep||ja.propDep,function(a,b){var c=a.ELEMENTS;return a.OFFSET?b.def(c,"?",c,".vertCount-",a.OFFSET,
":-1"):b.def(c,"?",c,".vertCount:-1")}):h?new J(D.thisDep,D.contextDep,D.propDep,function(a,b){return b.def(a.shared.vao,".currentVAO?",a.shared.vao,".currentVAO.count:-1")}):null}(),p=c("instances",!1);return{elements:X,primitive:m,count:l,instances:p,offset:ja,vao:D,vaoActive:h,elementsActive:ba,"static":g}}function y(a,b){var c=a["static"],d=a.dynamic,e={};Na.forEach(function(a){function b(z,g){if(a in c){var B=z(c[a]);e[f]=w(function(){return B})}else if(a in d){var h=d[a];e[f]=K(h,function(a,
b){return g(a,b,a.invoke(b,h))})}}var f=h(a);switch(a){case "cull.enable":case "blend.enable":case "dither":case "stencil.enable":case "depth.enable":case "scissor.enable":case "polygonOffset.enable":case "sample.alpha":case "sample.enable":case "depth.mask":return b(function(a){return a},function(a,b,c){return c});case "depth.func":return b(function(a){return ab[a]},function(a,b,c){return b.def(a.constants.compareFuncs,"[",c,"]")});case "depth.range":return b(function(a){return a},function(a,b,c){a=
b.def("+",c,"[0]");b=b.def("+",c,"[1]");return[a,b]});case "blend.func":return b(function(a){return[Ga["srcRGB"in a?a.srcRGB:a.src],Ga["dstRGB"in a?a.dstRGB:a.dst],Ga["srcAlpha"in a?a.srcAlpha:a.src],Ga["dstAlpha"in a?a.dstAlpha:a.dst]]},function(a,b,c){function d(a,e){return b.def('"',a,e,'" in ',c,"?",c,".",a,e,":",c,".",a)}a=a.constants.blendFuncs;var e=d("src","RGB"),f=d("dst","RGB"),e=b.def(a,"[",e,"]"),z=b.def(a,"[",d("src","Alpha"),"]"),f=b.def(a,"[",f,"]");a=b.def(a,"[",d("dst","Alpha"),"]");
return[e,f,z,a]});case "blend.equation":return b(function(a){if("string"===typeof a)return[fa[a],fa[a]];if("object"===typeof a)return[fa[a.rgb],fa[a.alpha]]},function(a,b,c){var d=a.constants.blendEquations,e=b.def(),f=b.def();a=a.cond("typeof ",c,'==="string"');a.then(e,"=",f,"=",d,"[",c,"];");a["else"](e,"=",d,"[",c,".rgb];",f,"=",d,"[",c,".alpha];");b(a);return[e,f]});case "blend.color":return b(function(a){return R(4,function(b){return+a[b]})},function(a,b,c){return R(4,function(a){return b.def("+",
c,"[",a,"]")})});case "stencil.mask":return b(function(a){return a|0},function(a,b,c){return b.def(c,"|0")});case "stencil.func":return b(function(a){return[ab[a.cmp||"keep"],a.ref||0,"mask"in a?a.mask:-1]},function(a,b,c){a=b.def('"cmp" in ',c,"?",a.constants.compareFuncs,"[",c,".cmp]",":",7680);var d=b.def(c,".ref|0");b=b.def('"mask" in ',c,"?",c,".mask|0:-1");return[a,d,b]});case "stencil.opFront":case "stencil.opBack":return b(function(b){return["stencil.opBack"===a?1029:1028,Ta[b.fail||"keep"],
Ta[b.zfail||"keep"],Ta[b.zpass||"keep"]]},function(b,c,d){function e(a){return c.def('"',a,'" in ',d,"?",f,"[",d,".",a,"]:",7680)}var f=b.constants.stencilOps;return["stencil.opBack"===a?1029:1028,e("fail"),e("zfail"),e("zpass")]});case "polygonOffset.offset":return b(function(a){return[a.factor|0,a.units|0]},function(a,b,c){a=b.def(c,".factor|0");b=b.def(c,".units|0");return[a,b]});case "cull.face":return b(function(a){var b=0;"front"===a?b=1028:"back"===a&&(b=1029);return b},function(a,b,c){return b.def(c,
'==="front"?',1028,":",1029)});case "lineWidth":return b(function(a){return a},function(a,b,c){return c});case "frontFace":return b(function(a){return zb[a]},function(a,b,c){return b.def(c+'==="cw"?2304:2305')});case "colorMask":return b(function(a){return a.map(function(a){return!!a})},function(a,b,c){return R(4,function(a){return"!!"+c+"["+a+"]"})});case "sample.coverage":return b(function(a){return["value"in a?a.value:1,!!a.invert]},function(a,b,c){a=b.def('"value" in ',c,"?+",c,".value:1");b=
b.def("!!",c,".invert");return[a,b]})}});return e}function T(a,b){var c=a["static"],d=a.dynamic,e={};Object.keys(c).forEach(function(a){var b=c[a],d;if("number"===typeof b||"boolean"===typeof b)d=w(function(){return b});else if("function"===typeof b){var f=b._reglType;if("texture2d"===f||"textureCube"===f)d=w(function(a){return a.link(b)});else if("framebuffer"===f||"framebufferCube"===f)d=w(function(a){return a.link(b.color[0])})}else ra(b)&&(d=w(function(a){return a.global.def("[",R(b.length,function(a){return b[a]}),
"]")}));d.value=b;e[a]=d});Object.keys(d).forEach(function(a){var b=d[a];e[a]=K(b,function(a,c){return a.invoke(c,b)})});return e}function wa(a,c){var d=a["static"],e=a.dynamic,g={};Object.keys(d).forEach(function(a){var c=d[a],e=b.id(a),z=new ea;if(Sa(c))z.state=1,z.buffer=f.getBuffer(f.create(c,34962,!1,!0)),z.type=0;else{var B=f.getBuffer(c);if(B)z.state=1,z.buffer=B,z.type=0;else if("constant"in c){var h=c.constant;z.buffer="null";z.state=2;"number"===typeof h?z.x=h:Da.forEach(function(a,b){b<
h.length&&(z[a]=h[b])})}else{var B=Sa(c.buffer)?f.getBuffer(f.create(c.buffer,34962,!1,!0)):f.getBuffer(c.buffer),k=c.offset|0,m=c.stride|0,l=c.size|0,oa=!!c.normalized,p=0;"type"in c&&(p=Ja[c.type]);c=c.divisor|0;z.buffer=B;z.state=1;z.size=l;z.normalized=oa;z.type=p||B.dtype;z.offset=k;z.stride=m;z.divisor=c}}g[a]=w(function(a,b){var c=a.attribCache;if(e in c)return c[e];var d={isStream:!1};Object.keys(z).forEach(function(a){d[a]=z[a]});z.buffer&&(d.buffer=a.link(z.buffer),d.type=d.type||d.buffer+
".dtype");return c[e]=d})});Object.keys(e).forEach(function(a){var b=e[a];g[a]=K(b,function(a,c){function d(a){c(B[a],"=",e,".",a,"|0;")}var e=a.invoke(c,b),f=a.shared,z=a.constants,g=f.isBufferArgs,f=f.buffer,B={isStream:c.def(!1)},h=new ea;h.state=1;Object.keys(h).forEach(function(a){B[a]=c.def(""+h[a])});var k=B.buffer,m=B.type;c("if(",g,"(",e,")){",B.isStream,"=true;",k,"=",f,".createStream(",34962,",",e,");",m,"=",k,".dtype;","}else{",k,"=",f,".getBuffer(",e,");","if(",k,"){",m,"=",k,".dtype;",
'}else if("constant" in ',e,"){",B.state,"=",2,";","if(typeof "+e+'.constant === "number"){',B[Da[0]],"=",e,".constant;",Da.slice(1).map(function(a){return B[a]}).join("="),"=0;","}else{",Da.map(function(a,b){return B[a]+"="+e+".constant.length>"+b+"?"+e+".constant["+b+"]:0;"}).join(""),"}}else{","if(",g,"(",e,".buffer)){",k,"=",f,".createStream(",34962,",",e,".buffer);","}else{",k,"=",f,".getBuffer(",e,".buffer);","}",m,'="type" in ',e,"?",z.glTypes,"[",e,".type]:",k,".dtype;",B.normalized,"=!!",
e,".normalized;");d("size");d("offset");d("stride");d("divisor");c("}}");c.exit("if(",B.isStream,"){",f,".destroyStream(",k,");","}");return B})});return g}function F(a){var b=a["static"],c=a.dynamic,d={};Object.keys(b).forEach(function(a){var c=b[a];d[a]=w(function(a,b){return"number"===typeof c||"boolean"===typeof c?""+c:a.link(c)})});Object.keys(c).forEach(function(a){var b=c[a];d[a]=K(b,function(a,c){return a.invoke(c,b)})});return d}function A(a,b,d,e,f){function g(a){var b=p[a];b&&(ja[a]=b)}
var m=O(a,b),l=G(a,f),p=C(a,l,f),X=M(a,f),ja=y(a,f),q=H(a,f,m);g("viewport");g(h("scissor.box"));var n=0<Object.keys(ja).length,l={framebuffer:l,draw:X,shader:q,state:ja,dirty:n,scopeVAO:null,drawVAO:null,useVAO:!1,attributes:{}};l.profile=t(a,f);l.uniforms=T(d,f);l.drawVAO=l.scopeVAO=X.vao;if(!l.drawVAO&&q.program&&!m&&c.angle_instanced_arrays&&X["static"].elements){var r=!0;a=q.program.attributes.map(function(a){a=b["static"][a];r=r&&!!a;return a});if(r&&0<a.length){var u=k.getVAO(k.createVAO({attributes:a,
elements:X["static"].elements}));l.drawVAO=new J(null,null,null,function(a,b){return a.link(u)});l.useVAO=!0}}m?l.useVAO=!0:l.attributes=wa(b,f);l.context=F(e,f);return l}function ia(a,b,c){var d=a.shared.context,e=a.scope();Object.keys(c).forEach(function(f){b.save(d,"."+f);var g=c[f].append(a,b);Array.isArray(g)?e(d,".",f,"=[",g.join(),"];"):e(d,".",f,"=",g,";")});b(e)}function S(a,b,c,d){var e=a.shared,f=e.gl,g=e.framebuffer,h;Ma&&(h=b.def(e.extensions,".webgl_draw_buffers"));var k=a.constants,
e=k.drawBuffer,k=k.backBuffer;a=c?c.append(a,b):b.def(g,".next");d||b("if(",a,"!==",g,".cur){");b("if(",a,"){",f,".bindFramebuffer(",36160,",",a,".framebuffer);");Ma&&b(h,".drawBuffersWEBGL(",e,"[",a,".colorAttachments.length]);");b("}else{",f,".bindFramebuffer(",36160,",null);");Ma&&b(h,".drawBuffersWEBGL(",k,");");b("}",g,".cur=",a,";");d||b("}")}function Aa(a,b,c){var d=a.shared,e=d.gl,f=a.current,g=a.next,k=d.current,l=d.next,m=a.cond(k,".dirty");Na.forEach(function(b){b=h(b);if(!(b in c.state)){var d,
B;if(b in g){d=g[b];B=f[b];var p=R(ta[b].length,function(a){return m.def(d,"[",a,"]")});m(a.cond(p.map(function(a,b){return a+"!=="+B+"["+b+"]"}).join("||")).then(e,".",va[b],"(",p,");",p.map(function(a,b){return B+"["+b+"]="+a}).join(";"),";"))}else d=m.def(l,".",b),p=a.cond(d,"!==",k,".",b),m(p),b in ua?p(a.cond(d).then(e,".enable(",ua[b],");")["else"](e,".disable(",ua[b],");"),k,".",b,"=",d,";"):p(e,".",va[b],"(",d,");",k,".",b,"=",d,";")}});0===Object.keys(c.state).length&&m(k,".dirty=false;");
b(m)}function I(a,b,c,d){var e=a.shared,f=a.current,g=e.current,h=e.gl;yb(Object.keys(c)).forEach(function(e){var k=c[e];if(!d||d(k)){var m=k.append(a,b);if(ua[e]){var l=ua[e];xa(k)?m?b(h,".enable(",l,");"):b(h,".disable(",l,");"):b(a.cond(m).then(h,".enable(",l,");")["else"](h,".disable(",l,");"));b(g,".",e,"=",m,";")}else if(ra(m)){var p=f[e];b(h,".",va[e],"(",m,");",m.map(function(a,b){return p+"["+b+"]="+a}).join(";"),";")}else b(h,".",va[e],"(",m,");",g,".",e,"=",m,";")}})}function N(a,b){W&&
(a.instancing=b.def(a.shared.extensions,".angle_instanced_arrays"))}function E(a,b,c,d,e){function f(){return"undefined"===typeof performance?"Date.now()":"performance.now()"}function g(a){r=b.def();a(r,"=",f(),";");"string"===typeof e?a(p,".count+=",e,";"):a(p,".count++;");l&&(d?(u=b.def(),a(u,"=",n,".getNumPendingQueries();")):a(n,".beginQuery(",p,");"))}function h(a){a(p,".cpuTime+=",f(),"-",r,";");l&&(d?a(n,".pushScopeStats(",u,",",n,".getNumPendingQueries(),",p,");"):a(n,".endQuery();"))}function k(a){var c=
b.def(q,".profile");b(q,".profile=",a,";");b.exit(q,".profile=",c,";")}var m=a.shared,p=a.stats,q=m.current,n=m.timer;c=c.profile;var r,u;if(c){if(xa(c)){c.enable?(g(b),h(b.exit),k("true")):k("false");return}c=c.append(a,b);k(c)}else c=b.def(q,".profile");m=a.block();g(m);b("if(",c,"){",m,"}");a=a.block();h(a);b.exit("if(",c,"){",a,"}")}function ga(a,b,c,d,e){function f(a){switch(a){case 35664:case 35667:case 35671:return 2;case 35665:case 35668:case 35672:return 3;case 35666:case 35669:case 35673:return 4;
default:return 1}}function g(c,d,e){function f(){b("if(!",p,".buffer){",m,".enableVertexAttribArray(",l,");}");var c=e.type,g;g=e.size?b.def(e.size,"||",d):d;b("if(",p,".type!==",c,"||",p,".size!==",g,"||",n.map(function(a){return p+"."+a+"!=="+e[a]}).join("||"),"){",m,".bindBuffer(",34962,",",ha,".buffer);",m,".vertexAttribPointer(",[l,g,c,e.normalized,e.stride,e.offset],");",p,".type=",c,";",p,".size=",g,";",n.map(function(a){return p+"."+a+"="+e[a]+";"}).join(""),"}");W&&(c=e.divisor,b("if(",p,
".divisor!==",c,"){",a.instancing,".vertexAttribDivisorANGLE(",[l,c],");",p,".divisor=",c,";}"))}function k(){b("if(",p,".buffer){",m,".disableVertexAttribArray(",l,");",p,".buffer=null;","}if(",Da.map(function(a,b){return p+"."+a+"!=="+q[b]}).join("||"),"){",m,".vertexAttrib4f(",l,",",q,");",Da.map(function(a,b){return p+"."+a+"="+q[b]+";"}).join(""),"}")}var m=h.gl,l=b.def(c,".location"),p=b.def(h.attributes,"[",l,"]");c=e.state;var ha=e.buffer,q=[e.x,e.y,e.z,e.w],n=["buffer","normalized","offset",
"stride"];1===c?f():2===c?k():(b("if(",c,"===",1,"){"),f(),b("}else{"),k(),b("}"))}var h=a.shared;d.forEach(function(d){var h=d.name,k=c.attributes[h],m;if(k){if(!e(k))return;m=k.append(a,b)}else{if(!e(Ab))return;var l=a.scopeAttrib(h);m={};Object.keys(new ea).forEach(function(a){m[a]=b.def(l,".",a)})}g(a.link(d),f(d.info.type),m)})}function Q(a,c,d,e,f,g){for(var h=a.shared,k=h.gl,m={},l,p=0;p<e.length;++p){var q=e[p],n=q.name,r=q.info.type,u=q.info.size,t=d.uniforms[n];if(1<u){if(!t)continue;var v=
n.replace("[0]","");if(m[v])continue;m[v]=1}var q=a.link(q)+".location",x;if(t){if(!f(t))continue;if(xa(t)){n=t.value;if(35678===r||35680===r)r=a.link(n._texture||n.color[0]._texture),c(k,".uniform1i(",q,",",r+".bind());"),c.exit(r,".unbind();");else if(35674===r||35675===r||35676===r)u=a.global.def("new Float32Array(["+Array.prototype.slice.call(n)+"])"),n=2,35675===r?n=3:35676===r&&(n=4),c(k,".uniformMatrix",n,"fv(",q,",false,",u,");");else{switch(r){case 5126:l="1f";break;case 35664:l="2f";break;
case 35665:l="3f";break;case 35666:l="4f";break;case 35670:l="1i";break;case 5124:l="1i";break;case 35671:l="2i";break;case 35667:l="2i";break;case 35672:l="3i";break;case 35668:l="3i";break;case 35673:l="4i";break;case 35669:l="4i"}1<u?(l+="v",n=a.global.def("["+Array.prototype.slice.call(n)+"]")):n=ra(n)?Array.prototype.slice.call(n):n;c(k,".uniform",l,"(",q,",",n,");")}continue}else x=t.append(a,c)}else{if(!f(Ab))continue;x=c.def(h.uniforms,"[",b.id(n),"]")}35678===r?c("if(",x,"&&",x,'._reglType==="framebuffer"){',
x,"=",x,".color[0];","}"):35680===r&&c("if(",x,"&&",x,'._reglType==="framebufferCube"){',x,"=",x,".color[0];","}");n=1;switch(r){case 35678:case 35680:r=c.def(x,"._texture");c(k,".uniform1i(",q,",",r,".bind());");c.exit(r,".unbind();");continue;case 5124:case 35670:l="1i";break;case 35667:case 35671:l="2i";n=2;break;case 35668:case 35672:l="3i";n=3;break;case 35669:case 35673:l="4i";n=4;break;case 5126:l="1f";break;case 35664:l="2f";n=2;break;case 35665:l="3f";n=3;break;case 35666:l="4f";n=4;break;
case 35674:l="Matrix2fv";break;case 35675:l="Matrix3fv";break;case 35676:l="Matrix4fv"}-1===l.indexOf("Matrix")&&1<u&&(l+="v",n=1);if("M"===l.charAt(0)){c(k,".uniform",l,"(",q,",");var q=Math.pow(r-35674+2,2),y=a.global.def("new Float32Array(",q,")");Array.isArray(x)?c("false,(",R(q,function(a){return y+"["+a+"]="+x[a]}),",",y,")"):c("false,(Array.isArray(",x,")||",x," instanceof Float32Array)?",x,":(",R(q,function(a){return y+"["+a+"]="+x+"["+a+"]"}),",",y,")");c(");")}else{if(1<n){for(var r=[],
w=[],u=0;u<n;++u)Array.isArray(x)?w.push(x[u]):w.push(c.def(x+"["+u+"]")),g&&r.push(c.def());g&&c("if(!",a.batchId,"||",r.map(function(a,b){return a+"!=="+w[b]}).join("||"),"){",r.map(function(a,b){return a+"="+w[b]+";"}).join(""));c(k,".uniform",l,"(",q,",",w.join(","),");")}else g&&(r=c.def(),c("if(!",a.batchId,"||",r,"!==",x,"){",r,"=",x,";")),c(k,".uniform",l,"(",q,",",x,");");g&&c("}")}}}function U(a,b,c,d){function e(f){var g=m[f];return g?g.contextDep&&d.contextDynamic||g.propDep?g.append(a,
c):g.append(a,b):b.def(k,".",f)}function f(){function a(){c(t,".drawElementsInstancedANGLE(",[n,r,x,q+"<<(("+x+"-5121)>>1)",u],");")}function b(){c(t,".drawArraysInstancedANGLE(",[n,q,r,u],");")}p&&"null"!==p?v?a():(c("if(",p,"){"),a(),c("}else{"),b(),c("}")):b()}function g(){function a(){c(l+".drawElements("+[n,r,x,q+"<<(("+x+"-5121)>>1)"]+");")}function b(){c(l+".drawArrays("+[n,q,r]+");")}p&&"null"!==p?v?a():(c("if(",p,"){"),a(),c("}else{"),b(),c("}")):b()}var h=a.shared,l=h.gl,k=h.draw,m=d.draw,
p=function(){var e=m.elements,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f);m.elementsActive&&f("if("+e+")"+l+".bindBuffer(34963,"+e+".buffer.buffer);")}else e=f.def(),f(e,"=",k,".","elements",";","if(",e,"){",l,".bindBuffer(",34963,",",e,".buffer.buffer);}","else if(",h.vao,".currentVAO){",e,"=",a.shared.elements+".getElements("+h.vao,".currentVAO.elements);",na?"":"if("+e+")"+l+".bindBuffer(34963,"+e+".buffer.buffer);","}");return e}(),n=e("primitive"),q=e("offset"),
r=function(){var e=m.count,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f)}else e=f.def(k,".","count");return e}();if("number"===typeof r){if(0===r)return}else c("if(",r,"){"),c.exit("}");var u,t;W&&(u=e("instances"),t=a.instancing);var x=p+".type",v=m.elements&&xa(m.elements)&&!m.vaoActive;W&&("number"!==typeof u||0<=u)?"string"===typeof u?(c("if(",u,">0){"),f(),c("}else if(",u,"<0){"),g(),c("}")):f():g()}function ca(a,b,c,d,e){b=P();e=b.proc("body",e);W&&(b.instancing=
e.def(b.shared.extensions,".angle_instanced_arrays"));a(b,e,c,d);return b.compile().body}function Z(a,b,c,d){N(a,b);c.useVAO?c.drawVAO?b(a.shared.vao,".setVAO(",c.drawVAO.append(a,b),");"):b(a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);"):(b(a.shared.vao,".setVAO(null);"),ga(a,b,c,d.attributes,function(){return!0}));Q(a,b,c,d.uniforms,function(){return!0},!1);U(a,b,b,c)}function Fa(a,b){var c=a.proc("draw",1);N(a,c);ia(a,c,b.context);S(a,c,b.framebuffer);Aa(a,c,b);I(a,c,b.state);E(a,c,b,!1,!0);
var d=b.shader.progVar.append(a,c);c(a.shared.gl,".useProgram(",d,".program);");if(b.shader.program)Z(a,c,b,b.shader.program);else{c(a.shared.vao,".setVAO(null);");var e=a.global.def("{}"),f=c.def(d,".id"),g=c.def(e,"[",f,"]");c(a.cond(g).then(g,".call(this,a0);")["else"](g,"=",e,"[",f,"]=",a.link(function(c){return ca(Z,a,b,c,1)}),"(",d,");",g,".call(this,a0);"))}0<Object.keys(b.state).length&&c(a.shared.current,".dirty=true;");a.shared.vao&&c(a.shared.vao,".setVAO(null);")}function pa(a,b,c,d){function e(){return!0}
a.batchId="a1";N(a,b);ga(a,b,c,d.attributes,e);Q(a,b,c,d.uniforms,e,!1);U(a,b,b,c)}function qa(a,b,c,d){function e(a){return a.contextDep&&g||a.propDep}function f(a){return!e(a)}N(a,b);var g=c.contextDep,h=b.def(),l=b.def();a.shared.props=l;a.batchId=h;var k=a.scope(),m=a.scope();b(k.entry,"for(",h,"=0;",h,"<","a1",";++",h,"){",l,"=","a0","[",h,"];",m,"}",k.exit);c.needsContext&&ia(a,m,c.context);c.needsFramebuffer&&S(a,m,c.framebuffer);I(a,m,c.state,e);c.profile&&e(c.profile)&&E(a,m,c,!1,!0);d?(c.useVAO?
c.drawVAO?e(c.drawVAO)?m(a.shared.vao,".setVAO(",c.drawVAO.append(a,m),");"):k(a.shared.vao,".setVAO(",c.drawVAO.append(a,k),");"):k(a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);"):(k(a.shared.vao,".setVAO(null);"),ga(a,k,c,d.attributes,f),ga(a,m,c,d.attributes,e)),Q(a,k,c,d.uniforms,f,!1),Q(a,m,c,d.uniforms,e,!0),U(a,k,m,c)):(b=a.global.def("{}"),d=c.shader.progVar.append(a,m),l=m.def(d,".id"),k=m.def(b,"[",l,"]"),m(a.shared.gl,".useProgram(",d,".program);","if(!",k,"){",k,"=",b,"[",l,"]=",
a.link(function(b){return ca(pa,a,c,b,2)}),"(",d,");}",k,".call(this,a0[",h,"],",h,");"))}function V(a,b){function c(a){return a.contextDep&&e||a.propDep}var d=a.proc("batch",2);a.batchId="0";N(a,d);var e=!1,f=!0;Object.keys(b.context).forEach(function(a){e=e||b.context[a].propDep});e||(ia(a,d,b.context),f=!1);var g=b.framebuffer,h=!1;g?(g.propDep?e=h=!0:g.contextDep&&e&&(h=!0),h||S(a,d,g)):S(a,d,null);b.state.viewport&&b.state.viewport.propDep&&(e=!0);Aa(a,d,b);I(a,d,b.state,function(a){return!c(a)});
b.profile&&c(b.profile)||E(a,d,b,!1,"a1");b.contextDep=e;b.needsContext=f;b.needsFramebuffer=h;f=b.shader.progVar;if(f.contextDep&&e||f.propDep)qa(a,d,b,null);else if(f=f.append(a,d),d(a.shared.gl,".useProgram(",f,".program);"),b.shader.program)qa(a,d,b,b.shader.program);else{d(a.shared.vao,".setVAO(null);");var g=a.global.def("{}"),h=d.def(f,".id"),l=d.def(g,"[",h,"]");d(a.cond(l).then(l,".call(this,a0,a1);")["else"](l,"=",g,"[",h,"]=",a.link(function(c){return ca(qa,a,b,c,2)}),"(",f,");",l,".call(this,a0,a1);"))}0<
Object.keys(b.state).length&&d(a.shared.current,".dirty=true;");a.shared.vao&&d(a.shared.vao,".setVAO(null);")}function ka(a,c){function d(b){var g=c.shader[b];g&&e.set(f.shader,"."+b,g.append(a,e))}var e=a.proc("scope",3);a.batchId="a2";var f=a.shared,g=f.current;ia(a,e,c.context);c.framebuffer&&c.framebuffer.append(a,e);yb(Object.keys(c.state)).forEach(function(b){var d=c.state[b].append(a,e);ra(d)?d.forEach(function(c,d){e.set(a.next[b],"["+d+"]",c)}):e.set(f.next,"."+b,d)});E(a,e,c,!0,!0);["elements",
"offset","count","instances","primitive"].forEach(function(b){var d=c.draw[b];d&&e.set(f.draw,"."+b,""+d.append(a,e))});Object.keys(c.uniforms).forEach(function(d){var g=c.uniforms[d].append(a,e);Array.isArray(g)&&(g="["+g.join()+"]");e.set(f.uniforms,"["+b.id(d)+"]",g)});Object.keys(c.attributes).forEach(function(b){var d=c.attributes[b].append(a,e),f=a.scopeAttrib(b);Object.keys(new ea).forEach(function(a){e.set(f,"."+a,d[a])})});c.scopeVAO&&e.set(f.vao,".targetVAO",c.scopeVAO.append(a,e));d("vert");
d("frag");0<Object.keys(c.state).length&&(e(g,".dirty=true;"),e.exit(g,".dirty=true;"));e("a1(",a.shared.context,",a0,",a.batchId,");")}function la(a){if("object"===typeof a&&!ra(a)){for(var b=Object.keys(a),c=0;c<b.length;++c)if(Y.isDynamic(a[b[c]]))return!0;return!1}}function aa(a,b,c){function d(a,b){g.forEach(function(c){var d=e[c];Y.isDynamic(d)&&(d=a.invoke(b,d),b(m,".",c,"=",d,";"))})}var e=b["static"][c];if(e&&la(e)){var f=a.global,g=Object.keys(e),h=!1,l=!1,k=!1,m=a.global.def("{}");g.forEach(function(b){var c=
e[b];if(Y.isDynamic(c))"function"===typeof c&&(c=e[b]=Y.unbox(c)),b=K(c,null),h=h||b.thisDep,k=k||b.propDep,l=l||b.contextDep;else{f(m,".",b,"=");switch(typeof c){case "number":f(c);break;case "string":f('"',c,'"');break;case "object":Array.isArray(c)&&f("[",c.join(),"]");break;default:f(a.link(c))}f(";")}});b.dynamic[c]=new Y.DynamicVariable(4,{thisDep:h,contextDep:l,propDep:k,ref:m,append:d});delete b["static"][c]}}var ea=k.Record,fa={add:32774,subtract:32778,"reverse subtract":32779};c.ext_blend_minmax&&
(fa.min=32775,fa.max=32776);var W=c.angle_instanced_arrays,Ma=c.webgl_draw_buffers,na=c.oes_vertex_array_object,ta={dirty:!0,profile:g.profile},Ea={},Na=[],ua={},va={};r("dither",3024);r("blend.enable",3042);p("blend.color","blendColor",[0,0,0,0]);p("blend.equation","blendEquationSeparate",[32774,32774]);p("blend.func","blendFuncSeparate",[1,0,1,0]);r("depth.enable",2929,!0);p("depth.func","depthFunc",513);p("depth.range","depthRange",[0,1]);p("depth.mask","depthMask",!0);p("colorMask","colorMask",
[!0,!0,!0,!0]);r("cull.enable",2884);p("cull.face","cullFace",1029);p("frontFace","frontFace",2305);p("lineWidth","lineWidth",1);r("polygonOffset.enable",32823);p("polygonOffset.offset","polygonOffset",[0,0]);r("sample.alpha",32926);r("sample.enable",32928);p("sample.coverage","sampleCoverage",[1,!1]);r("stencil.enable",2960);p("stencil.mask","stencilMask",-1);p("stencil.func","stencilFunc",[519,0,-1]);p("stencil.opFront","stencilOpSeparate",[1028,7680,7680,7680]);p("stencil.opBack","stencilOpSeparate",
[1029,7680,7680,7680]);r("scissor.enable",3089);p("scissor.box","scissor",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);p("viewport","viewport",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);var tb={gl:a,context:x,strings:b,next:Ea,current:ta,draw:m,elements:d,buffer:f,shader:u,attributes:k.state,vao:k,uniforms:v,framebuffer:n,extensions:c,timer:l,isBufferArgs:Sa},Pa={primTypes:Ka,compareFuncs:ab,blendFuncs:Ga,blendEquations:fa,stencilOps:Ta,glTypes:Ja,orientationType:zb};Ma&&(Pa.backBuffer=
[1029],Pa.drawBuffer=R(e.maxDrawbuffers,function(a){return 0===a?[0]:R(a,function(a){return 36064+a})}));var sa=0;return{next:Ea,current:ta,procs:function(){var a=P(),b=a.proc("poll"),d=a.proc("refresh"),f=a.block();b(f);d(f);var g=a.shared,h=g.gl,l=g.next,k=g.current;f(k,".dirty=false;");S(a,b);S(a,d,null,!0);var m;W&&(m=a.link(W));c.oes_vertex_array_object&&d(a.link(c.oes_vertex_array_object),".bindVertexArrayOES(null);");for(var p=0;p<e.maxAttributes;++p){var n=d.def(g.attributes,"[",p,"]"),q=
a.cond(n,".buffer");q.then(h,".enableVertexAttribArray(",p,");",h,".bindBuffer(",34962,",",n,".buffer.buffer);",h,".vertexAttribPointer(",p,",",n,".size,",n,".type,",n,".normalized,",n,".stride,",n,".offset);")["else"](h,".disableVertexAttribArray(",p,");",h,".vertexAttrib4f(",p,",",n,".x,",n,".y,",n,".z,",n,".w);",n,".buffer=null;");d(q);W&&d(m,".vertexAttribDivisorANGLE(",p,",",n,".divisor);")}d(a.shared.vao,".currentVAO=null;",a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);");Object.keys(ua).forEach(function(c){var e=
ua[c],g=f.def(l,".",c),m=a.block();m("if(",g,"){",h,".enable(",e,")}else{",h,".disable(",e,")}",k,".",c,"=",g,";");d(m);b("if(",g,"!==",k,".",c,"){",m,"}")});Object.keys(va).forEach(function(c){var e=va[c],g=ta[c],m,p,n=a.block();n(h,".",e,"(");ra(g)?(e=g.length,m=a.global.def(l,".",c),p=a.global.def(k,".",c),n(R(e,function(a){return m+"["+a+"]"}),");",R(e,function(a){return p+"["+a+"]="+m+"["+a+"];"}).join("")),b("if(",R(e,function(a){return m+"["+a+"]!=="+p+"["+a+"]"}).join("||"),"){",n,"}")):(m=
f.def(l,".",c),p=f.def(k,".",c),n(m,");",k,".",c,"=",m,";"),b("if(",m,"!==",p,"){",n,"}"));d(n)});return a.compile()}(),compile:function(a,b,c,d,e){var f=P();f.stats=f.link(e);Object.keys(b["static"]).forEach(function(a){aa(f,b,a)});Xb.forEach(function(b){aa(f,a,b)});var g=A(a,b,c,d,f);Fa(f,g);ka(f,g);V(f,g);return L(f.compile(),{destroy:function(){g.shader.program.destroy()}})}}}function Bb(a,b){for(var c=0;c<a.length;++c)if(a[c]===b)return c;return-1}var L=function(a,b){for(var c=Object.keys(b),
e=0;e<c.length;++e)a[c[e]]=b[c[e]];return a},Db=0,Y={DynamicVariable:Z,define:function(a,b){return new Z(a,cb(b+""))},isDynamic:function(a){return"function"===typeof a&&!a._reglType||a instanceof Z},unbox:db,accessor:cb},bb={next:"function"===typeof requestAnimationFrame?function(a){return requestAnimationFrame(a)}:function(a){return setTimeout(a,16)},cancel:"function"===typeof cancelAnimationFrame?function(a){return cancelAnimationFrame(a)}:clearTimeout},Cb="undefined"!==typeof performance&&performance.now?
function(){return performance.now()}:function(){return+new Date},G=hb();G.zero=hb();var Yb=function(a,b){var c=1;b.ext_texture_filter_anisotropic&&(c=a.getParameter(34047));var e=1,f=1;b.webgl_draw_buffers&&(e=a.getParameter(34852),f=a.getParameter(36063));var d=!!b.oes_texture_float;if(d){d=a.createTexture();a.bindTexture(3553,d);a.texImage2D(3553,0,6408,1,1,0,6408,5126,null);var q=a.createFramebuffer();a.bindFramebuffer(36160,q);a.framebufferTexture2D(36160,36064,3553,d,0);a.bindTexture(3553,null);
if(36053!==a.checkFramebufferStatus(36160))d=!1;else{a.viewport(0,0,1,1);a.clearColor(1,0,0,1);a.clear(16384);var n=G.allocType(5126,4);a.readPixels(0,0,1,1,6408,5126,n);a.getError()?d=!1:(a.deleteFramebuffer(q),a.deleteTexture(d),d=1===n[0]);G.freeType(n)}}n=!0;"undefined"!==typeof navigator&&(/MSIE/.test(navigator.userAgent)||/Trident\//.test(navigator.appVersion)||/Edge/.test(navigator.userAgent))||(n=a.createTexture(),q=G.allocType(5121,36),a.activeTexture(33984),a.bindTexture(34067,n),a.texImage2D(34069,
0,6408,3,3,0,6408,5121,q),G.freeType(q),a.bindTexture(34067,null),a.deleteTexture(n),n=!a.getError());return{colorBits:[a.getParameter(3410),a.getParameter(3411),a.getParameter(3412),a.getParameter(3413)],depthBits:a.getParameter(3414),stencilBits:a.getParameter(3415),subpixelBits:a.getParameter(3408),extensions:Object.keys(b).filter(function(a){return!!b[a]}),maxAnisotropic:c,maxDrawbuffers:e,maxColorAttachments:f,pointSizeDims:a.getParameter(33901),lineWidthDims:a.getParameter(33902),maxViewportDims:a.getParameter(3386),
maxCombinedTextureUnits:a.getParameter(35661),maxCubeMapSize:a.getParameter(34076),maxRenderbufferSize:a.getParameter(34024),maxTextureUnits:a.getParameter(34930),maxTextureSize:a.getParameter(3379),maxAttributes:a.getParameter(34921),maxVertexUniforms:a.getParameter(36347),maxVertexTextureUnits:a.getParameter(35660),maxVaryingVectors:a.getParameter(36348),maxFragmentUniforms:a.getParameter(36349),glsl:a.getParameter(35724),renderer:a.getParameter(7937),vendor:a.getParameter(7936),version:a.getParameter(7938),
readFloat:d,npotTextureCube:n}},O=function(a){return a instanceof Uint8Array||a instanceof Uint16Array||a instanceof Uint32Array||a instanceof Int8Array||a instanceof Int16Array||a instanceof Int32Array||a instanceof Float32Array||a instanceof Float64Array||a instanceof Uint8ClampedArray},I=function(a){return Object.keys(a).map(function(b){return a[b]})},Qa={shape:function(a){for(var b=[];a.length;a=a[0])b.push(a.length);return b},flatten:function(a,b,c,e){var f=1;if(b.length)for(var d=0;d<b.length;++d)f*=
b[d];else f=0;c=e||G.allocType(c,f);switch(b.length){case 0:break;case 1:e=b[0];for(b=0;b<e;++b)c[b]=a[b];break;case 2:e=b[0];b=b[1];for(d=f=0;d<e;++d)for(var q=a[d],n=0;n<b;++n)c[f++]=q[n];break;case 3:ib(a,b[0],b[1],b[2],c,0);break;default:jb(a,b,0,c,0)}return c}},Ia={"[object Int8Array]":5120,"[object Int16Array]":5122,"[object Int32Array]":5124,"[object Uint8Array]":5121,"[object Uint8ClampedArray]":5121,"[object Uint16Array]":5123,"[object Uint32Array]":5125,"[object Float32Array]":5126,"[object Float64Array]":5121,
"[object ArrayBuffer]":5121},Ja={int8:5120,int16:5122,int32:5124,uint8:5121,uint16:5123,uint32:5125,"float":5126,float32:5126},nb={dynamic:35048,stream:35040,"static":35044},Ua=Qa.flatten,mb=Qa.shape,na=[];na[5120]=1;na[5122]=2;na[5124]=4;na[5121]=1;na[5123]=2;na[5125]=4;na[5126]=4;var Ka={points:0,point:0,lines:1,line:1,triangles:4,triangle:4,"line loop":2,"line strip":3,"triangle strip":5,"triangle fan":6},pb=new Float32Array(1),Lb=new Uint32Array(pb.buffer),Pb=[9984,9986,9985,9987],Oa=[0,6409,
6410,6407,6408],U={};U[6409]=U[6406]=U[6402]=1;U[34041]=U[6410]=2;U[6407]=U[35904]=3;U[6408]=U[35906]=4;var Xa=sa("HTMLCanvasElement"),Ya=sa("OffscreenCanvas"),ub=sa("CanvasRenderingContext2D"),vb=sa("ImageBitmap"),wb=sa("HTMLImageElement"),xb=sa("HTMLVideoElement"),Mb=Object.keys(Ia).concat([Xa,Ya,ub,vb,wb,xb]),za=[];za[5121]=1;za[5126]=4;za[36193]=2;za[5123]=2;za[5125]=4;var C=[];C[32854]=2;C[32855]=2;C[36194]=2;C[34041]=4;C[33776]=.5;C[33777]=.5;C[33778]=1;C[33779]=1;C[35986]=.5;C[35987]=1;C[34798]=
1;C[35840]=.5;C[35841]=.25;C[35842]=.5;C[35843]=.25;C[36196]=.5;var Q=[];Q[32854]=2;Q[32855]=2;Q[36194]=2;Q[33189]=2;Q[36168]=1;Q[34041]=4;Q[35907]=4;Q[34836]=16;Q[34842]=8;Q[34843]=6;var Zb=function(a,b,c,e,f){function d(a){this.id=k++;this.refCount=1;this.renderbuffer=a;this.format=32854;this.height=this.width=0;f.profile&&(this.stats={size:0})}function q(b){var c=b.renderbuffer;a.bindRenderbuffer(36161,null);a.deleteRenderbuffer(c);b.renderbuffer=null;b.refCount=0;delete u[b.id];e.renderbufferCount--}
var n={rgba4:32854,rgb565:36194,"rgb5 a1":32855,depth:33189,stencil:36168,"depth stencil":34041};b.ext_srgb&&(n.srgba=35907);b.ext_color_buffer_half_float&&(n.rgba16f=34842,n.rgb16f=34843);b.webgl_color_buffer_float&&(n.rgba32f=34836);var v=[];Object.keys(n).forEach(function(a){v[n[a]]=a});var k=0,u={};d.prototype.decRef=function(){0>=--this.refCount&&q(this)};f.profile&&(e.getTotalRenderbufferSize=function(){var a=0;Object.keys(u).forEach(function(b){a+=u[b].stats.size});return a});return{create:function(b,
c){function l(b,c){var d=0,e=0,k=32854;"object"===typeof b&&b?("shape"in b?(e=b.shape,d=e[0]|0,e=e[1]|0):("radius"in b&&(d=e=b.radius|0),"width"in b&&(d=b.width|0),"height"in b&&(e=b.height|0)),"format"in b&&(k=n[b.format])):"number"===typeof b?(d=b|0,e="number"===typeof c?c|0:d):b||(d=e=1);if(d!==g.width||e!==g.height||k!==g.format)return l.width=g.width=d,l.height=g.height=e,g.format=k,a.bindRenderbuffer(36161,g.renderbuffer),a.renderbufferStorage(36161,k,d,e),f.profile&&(g.stats.size=Q[g.format]*
g.width*g.height),l.format=v[g.format],l}var g=new d(a.createRenderbuffer());u[g.id]=g;e.renderbufferCount++;l(b,c);l.resize=function(b,c){var d=b|0,e=c|0||d;if(d===g.width&&e===g.height)return l;l.width=g.width=d;l.height=g.height=e;a.bindRenderbuffer(36161,g.renderbuffer);a.renderbufferStorage(36161,g.format,d,e);f.profile&&(g.stats.size=Q[g.format]*g.width*g.height);return l};l._reglType="renderbuffer";l._renderbuffer=g;f.profile&&(l.stats=g.stats);l.destroy=function(){g.decRef()};return l},clear:function(){I(u).forEach(q)},
restore:function(){I(u).forEach(function(b){b.renderbuffer=a.createRenderbuffer();a.bindRenderbuffer(36161,b.renderbuffer);a.renderbufferStorage(36161,b.format,b.width,b.height)});a.bindRenderbuffer(36161,null)}}},Za=[];Za[6408]=4;Za[6407]=3;var Ra=[];Ra[5121]=1;Ra[5126]=4;Ra[36193]=2;var Da=["x","y","z","w"],Xb="blend.func blend.equation stencil.func stencil.opFront stencil.opBack sample.coverage viewport scissor.box polygonOffset.offset".split(" "),Ga={0:0,1:1,zero:0,one:1,"src color":768,"one minus src color":769,
"src alpha":770,"one minus src alpha":771,"dst color":774,"one minus dst color":775,"dst alpha":772,"one minus dst alpha":773,"constant color":32769,"one minus constant color":32770,"constant alpha":32771,"one minus constant alpha":32772,"src alpha saturate":776},ab={never:512,less:513,"<":513,equal:514,"=":514,"==":514,"===":514,lequal:515,"<=":515,greater:516,">":516,notequal:517,"!=":517,"!==":517,gequal:518,">=":518,always:519},Ta={0:0,zero:0,keep:7680,replace:7681,increment:7682,decrement:7683,
"increment wrap":34055,"decrement wrap":34056,invert:5386},zb={cw:2304,ccw:2305},Ab=new J(!1,!1,!1,function(){}),$b=function(a,b){function c(){this.endQueryIndex=this.startQueryIndex=-1;this.sum=0;this.stats=null}function e(a,b,d){var e=q.pop()||new c;e.startQueryIndex=a;e.endQueryIndex=b;e.sum=0;e.stats=d;n.push(e)}if(!b.ext_disjoint_timer_query)return null;var f=[],d=[],q=[],n=[],v=[],k=[];return{beginQuery:function(a){var c=f.pop()||b.ext_disjoint_timer_query.createQueryEXT();b.ext_disjoint_timer_query.beginQueryEXT(35007,
c);d.push(c);e(d.length-1,d.length,a)},endQuery:function(){b.ext_disjoint_timer_query.endQueryEXT(35007)},pushScopeStats:e,update:function(){var a,c;a=d.length;if(0!==a){k.length=Math.max(k.length,a+1);v.length=Math.max(v.length,a+1);v[0]=0;var e=k[0]=0;for(c=a=0;c<d.length;++c){var l=d[c];b.ext_disjoint_timer_query.getQueryObjectEXT(l,34919)?(e+=b.ext_disjoint_timer_query.getQueryObjectEXT(l,34918),f.push(l)):d[a++]=l;v[c+1]=e;k[c+1]=a}d.length=a;for(c=a=0;c<n.length;++c){var e=n[c],g=e.startQueryIndex,
l=e.endQueryIndex;e.sum+=v[l]-v[g];g=k[g];l=k[l];l===g?(e.stats.gpuTime+=e.sum/1E6,q.push(e)):(e.startQueryIndex=g,e.endQueryIndex=l,n[a++]=e)}n.length=a}},getNumPendingQueries:function(){return d.length},clear:function(){f.push.apply(f,d);for(var a=0;a<f.length;a++)b.ext_disjoint_timer_query.deleteQueryEXT(f[a]);d.length=0;f.length=0},restore:function(){d.length=0;f.length=0}}};return function(a){function b(){if(0===E.length)t&&t.update(),ca=null;else{ca=bb.next(b);u();for(var a=E.length-1;0<=a;--a){var c=
E[a];c&&c(H,null,0)}l.flush();t&&t.update()}}function c(){!ca&&0<E.length&&(ca=bb.next(b))}function e(){ca&&(bb.cancel(b),ca=null)}function f(a){a.preventDefault();e();R.forEach(function(a){a()})}function d(a){l.getError();h.restore();F.restore();y.restore();A.restore();O.restore();S.restore();K.restore();t&&t.restore();I.procs.refresh();c();U.forEach(function(a){a()})}function q(a){function b(a,c){var d={},e={};Object.keys(a).forEach(function(b){var f=a[b];if(Y.isDynamic(f))e[b]=Y.unbox(f,b);else{if(c&&
Array.isArray(f))for(var g=0;g<f.length;++g)if(Y.isDynamic(f[g])){e[b]=Y.unbox(f,b);return}d[b]=f}});return{dynamic:e,"static":d}}function c(a){for(;n.length<a;)n.push(null);return n}var d=b(a.context||{},!0),e=b(a.uniforms||{},!0),f=b(a.attributes||{},!1);a=b(function(a){function b(a){if(a in c){var d=c[a];delete c[a];Object.keys(d).forEach(function(b){c[a+"."+b]=d[b]})}}var c=L({},a);delete c.uniforms;delete c.attributes;delete c.context;delete c.vao;"stencil"in c&&c.stencil.op&&(c.stencil.opBack=
c.stencil.opFront=c.stencil.op,delete c.stencil.op);b("blend");b("depth");b("cull");b("stencil");b("polygonOffset");b("scissor");b("sample");"vao"in a&&(c.vao=a.vao);return c}(a),!1);var g={gpuTime:0,cpuTime:0,count:0},h=I.compile(a,f,e,d,g),k=h.draw,l=h.batch,m=h.scope,n=[];return L(function(a,b){var d;if("function"===typeof a)return m.call(this,null,a,0);if("function"===typeof b)if("number"===typeof a)for(d=0;d<a;++d)m.call(this,null,b,d);else if(Array.isArray(a))for(d=0;d<a.length;++d)m.call(this,
a[d],b,d);else return m.call(this,a,b,0);else if("number"===typeof a){if(0<a)return l.call(this,c(a|0),a|0)}else if(Array.isArray(a)){if(a.length)return l.call(this,a,a.length)}else return k.call(this,a)},{stats:g,destroy:function(){h.destroy()}})}function n(a,b){var c=0;I.procs.poll();var d=b.color;d&&(l.clearColor(+d[0]||0,+d[1]||0,+d[2]||0,+d[3]||0),c|=16384);"depth"in b&&(l.clearDepth(+b.depth),c|=256);"stencil"in b&&(l.clearStencil(b.stencil|0),c|=1024);l.clear(c)}function v(a){E.push(a);c();
return{cancel:function(){function b(){var a=Bb(E,b);E[a]=E[E.length-1];--E.length;0>=E.length&&e()}var c=Bb(E,a);E[c]=b}}}function k(){var a=Q.viewport,b=Q.scissor_box;a[0]=a[1]=b[0]=b[1]=0;H.viewportWidth=H.framebufferWidth=H.drawingBufferWidth=a[2]=b[2]=l.drawingBufferWidth;H.viewportHeight=H.framebufferHeight=H.drawingBufferHeight=a[3]=b[3]=l.drawingBufferHeight}function u(){H.tick+=1;H.time=x();k();I.procs.poll()}function m(){A.refresh();k();I.procs.refresh();t&&t.update()}function x(){return(Cb()-
G)/1E3}a=Hb(a);if(!a)return null;var l=a.gl,g=l.getContextAttributes();l.isContextLost();var h=Ib(l,a);if(!h)return null;var r=Eb(),p={vaoCount:0,bufferCount:0,elementsCount:0,framebufferCount:0,shaderCount:0,textureCount:0,cubeCount:0,renderbufferCount:0,maxTextureUnits:0},w=h.extensions,t=$b(l,w),G=Cb(),C=l.drawingBufferWidth,J=l.drawingBufferHeight,H={tick:0,time:0,viewportWidth:C,viewportHeight:J,framebufferWidth:C,framebufferHeight:J,drawingBufferWidth:C,drawingBufferHeight:J,pixelRatio:a.pixelRatio},
C={elements:null,primitive:4,count:-1,offset:0,instances:-1},M=Yb(l,w),y=Jb(l,p,a,function(a){return K.destroyBuffer(a)}),T=Kb(l,w,y,p),K=Sb(l,w,M,p,y,T,C),F=Tb(l,r,p,a),A=Nb(l,w,M,function(){I.procs.poll()},H,p,a),O=Zb(l,w,M,p,a),S=Rb(l,w,M,A,O,p),I=Wb(l,r,w,M,y,T,A,S,{},K,F,C,H,t,a),r=Ub(l,S,I.procs.poll,H,g,w,M),Q=I.next,N=l.canvas,E=[],R=[],U=[],Z=[a.onDestroy],ca=null;N&&(N.addEventListener("webglcontextlost",f,!1),N.addEventListener("webglcontextrestored",d,!1));var aa=S.setFBO=q({framebuffer:Y.define.call(null,
1,"framebuffer")});m();g=L(q,{clear:function(a){if("framebuffer"in a)if(a.framebuffer&&"framebufferCube"===a.framebuffer_reglType)for(var b=0;6>b;++b)aa(L({framebuffer:a.framebuffer.faces[b]},a),n);else aa(a,n);else n(null,a)},prop:Y.define.bind(null,1),context:Y.define.bind(null,2),"this":Y.define.bind(null,3),draw:q({}),buffer:function(a){return y.create(a,34962,!1,!1)},elements:function(a){return T.create(a,!1)},texture:A.create2D,cube:A.createCube,renderbuffer:O.create,framebuffer:S.create,framebufferCube:S.createCube,
vao:K.createVAO,attributes:g,frame:v,on:function(a,b){var c;switch(a){case "frame":return v(b);case "lost":c=R;break;case "restore":c=U;break;case "destroy":c=Z}c.push(b);return{cancel:function(){for(var a=0;a<c.length;++a)if(c[a]===b){c[a]=c[c.length-1];c.pop();break}}}},limits:M,hasExtension:function(a){return 0<=M.extensions.indexOf(a.toLowerCase())},read:r,destroy:function(){E.length=0;e();N&&(N.removeEventListener("webglcontextlost",f),N.removeEventListener("webglcontextrestored",d));F.clear();
S.clear();O.clear();K.clear();A.clear();T.clear();y.clear();t&&t.clear();Z.forEach(function(a){a()})},_gl:l,_refresh:m,poll:function(){u();t&&t.update()},now:x,stats:p});a.onDone(null,g);return g}});

},{}],95:[function(require,module,exports){
/* global XMLHttpRequest */
var configParameters = [
  'manifest',
  'onDone',
  'onProgress',
  'onError'
]

var manifestParameters = [
  'type',
  'src',
  'stream',
  'credentials',
  'parser'
]

var parserParameters = [
  'onData',
  'onDone'
]

var STATE_ERROR = -1
var STATE_DATA = 0
var STATE_COMPLETE = 1

function raise (message) {
  throw new Error('resl: ' + message)
}

function checkType (object, parameters, name) {
  Object.keys(object).forEach(function (param) {
    if (parameters.indexOf(param) < 0) {
      raise('invalid parameter "' + param + '" in ' + name)
    }
  })
}

function Loader (name, cancel) {
  this.state = STATE_DATA
  this.ready = false
  this.progress = 0
  this.name = name
  this.cancel = cancel
}

module.exports = function resl (config) {
  if (typeof config !== 'object' || !config) {
    raise('invalid or missing configuration')
  }

  checkType(config, configParameters, 'config')

  var manifest = config.manifest
  if (typeof manifest !== 'object' || !manifest) {
    raise('missing manifest')
  }

  function getFunction (name, dflt) {
    if (name in config) {
      var func = config[name]
      if (typeof func !== 'function') {
        raise('invalid callback "' + name + '"')
      }
      return func
    }
    return null
  }

  var onDone = getFunction('onDone')
  if (!onDone) {
    raise('missing onDone() callback')
  }

  var onProgress = getFunction('onProgress')
  var onError = getFunction('onError')

  var assets = {}

  var state = STATE_DATA

  function loadXHR (request) {
    var name = request.name
    var stream = request.stream
    var binary = request.type === 'binary'
    var parser = request.parser

    var xhr = new XMLHttpRequest()
    var asset = null

    var loader = new Loader(name, cancel)

    if (stream) {
      xhr.onreadystatechange = onReadyStateChange
    } else {
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          onReadyStateChange()
        }
      }
    }

    if (binary) {
      xhr.responseType = 'arraybuffer'
    }

    function onReadyStateChange () {
      if (xhr.readyState < 2 ||
          loader.state === STATE_COMPLETE ||
          loader.state === STATE_ERROR) {
        return
      }
      if (xhr.status !== 200) {
        return abort('error loading resource "' + request.name + '"')
      }
      if (xhr.readyState > 2 && loader.state === STATE_DATA) {
        var response
        if (request.type === 'binary') {
          response = xhr.response
        } else {
          response = xhr.responseText
        }
        if (parser.data) {
          try {
            asset = parser.data(response)
          } catch (e) {
            return abort(e)
          }
        } else {
          asset = response
        }
      }
      if (xhr.readyState > 3 && loader.state === STATE_DATA) {
        if (parser.done) {
          try {
            asset = parser.done()
          } catch (e) {
            return abort(e)
          }
        }
        loader.state = STATE_COMPLETE
      }
      assets[name] = asset
      loader.progress = 0.75 * loader.progress + 0.25
      loader.ready =
        (request.stream && !!asset) ||
        loader.state === STATE_COMPLETE
      notifyProgress()
    }

    function cancel () {
      if (loader.state === STATE_COMPLETE || loader.state === STATE_ERROR) {
        return
      }
      xhr.onreadystatechange = null
      xhr.abort()
      loader.state = STATE_ERROR
    }

    // set up request
    if (request.credentials) {
      xhr.withCredentials = true
    }
    xhr.open('GET', request.src, true)
    xhr.send()

    return loader
  }

  function loadElement (request, element) {
    var name = request.name
    var parser = request.parser

    var loader = new Loader(name, cancel)
    var asset = element

    function handleProgress () {
      if (loader.state === STATE_DATA) {
        if (parser.data) {
          try {
            asset = parser.data(element)
          } catch (e) {
            return abort(e)
          }
        } else {
          asset = element
        }
      }
    }

    function onProgress (e) {
      handleProgress()
      assets[name] = asset
      if (e.lengthComputable) {
        loader.progress = Math.max(loader.progress, e.loaded / e.total)
      } else {
        loader.progress = 0.75 * loader.progress + 0.25
      }
      notifyProgress(name)
    }

    function onComplete () {
      handleProgress()
      if (loader.state === STATE_DATA) {
        if (parser.done) {
          try {
            asset = parser.done()
          } catch (e) {
            return abort(e)
          }
        }
        loader.state = STATE_COMPLETE
      }
      loader.progress = 1
      loader.ready = true
      assets[name] = asset
      removeListeners()
      notifyProgress('finish ' + name)
    }

    function onError () {
      abort('error loading asset "' + name + '"')
    }

    if (request.stream) {
      element.addEventListener('progress', onProgress)
    }
    if (request.type === 'image') {
      element.addEventListener('load', onComplete)
    } else {
      var canPlay = false
      var loadedMetaData = false
      element.addEventListener('loadedmetadata', function () {
        loadedMetaData = true
        if (canPlay) {
          onComplete()
        }
      })
      element.addEventListener('canplay', function () {
        canPlay = true
        if (loadedMetaData) {
          onComplete()
        }
      })
    }
    element.addEventListener('error', onError)

    function removeListeners () {
      if (request.stream) {
        element.removeEventListener('progress', onProgress)
      }
      if (request.type === 'image') {
        element.addEventListener('load', onComplete)
      } else {
        element.addEventListener('canplay', onComplete)
      }
      element.removeEventListener('error', onError)
    }

    function cancel () {
      if (loader.state === STATE_COMPLETE || loader.state === STATE_ERROR) {
        return
      }
      loader.state = STATE_ERROR
      removeListeners()
      element.src = ''
    }

    // set up request
    if (request.credentials) {
      element.crossOrigin = 'use-credentials'
    } else {
      element.crossOrigin = 'anonymous'
    }
    element.src = request.src

    return loader
  }

  var loaders = {
    text: loadXHR,
    binary: function (request) {
      // TODO use fetch API for streaming if supported
      return loadXHR(request)
    },
    image: function (request) {
      return loadElement(request, document.createElement('img'))
    },
    video: function (request) {
      return loadElement(request, document.createElement('video'))
    },
    audio: function (request) {
      return loadElement(request, document.createElement('audio'))
    }
  }

  // First we parse all objects in order to verify that all type information
  // is correct
  var pending = Object.keys(manifest).map(function (name) {
    var request = manifest[name]
    if (typeof request === 'string') {
      request = {
        src: request
      }
    } else if (typeof request !== 'object' || !request) {
      raise('invalid asset definition "' + name + '"')
    }

    checkType(request, manifestParameters, 'asset "' + name + '"')

    function getParameter (prop, accepted, init) {
      var value = init
      if (prop in request) {
        value = request[prop]
      }
      if (accepted.indexOf(value) < 0) {
        raise('invalid ' + prop + ' "' + value + '" for asset "' + name + '", possible values: ' + accepted)
      }
      return value
    }

    function getString (prop, required, init) {
      var value = init
      if (prop in request) {
        value = request[prop]
      } else if (required) {
        raise('missing ' + prop + ' for asset "' + name + '"')
      }
      if (typeof value !== 'string') {
        raise('invalid ' + prop + ' for asset "' + name + '", must be a string')
      }
      return value
    }

    function getParseFunc (name, dflt) {
      if (name in request.parser) {
        var result = request.parser[name]
        if (typeof result !== 'function') {
          raise('invalid parser callback ' + name + ' for asset "' + name + '"')
        }
        return result
      } else {
        return dflt
      }
    }

    var parser = {}
    if ('parser' in request) {
      if (typeof request.parser === 'function') {
        parser = {
          data: request.parser
        }
      } else if (typeof request.parser === 'object' && request.parser) {
        checkType(parser, parserParameters, 'parser for asset "' + name + '"')
        if (!('onData' in parser)) {
          raise('missing onData callback for parser in asset "' + name + '"')
        }
        parser = {
          data: getParseFunc('onData'),
          done: getParseFunc('onDone')
        }
      } else {
        raise('invalid parser for asset "' + name + '"')
      }
    }

    return {
      name: name,
      type: getParameter('type', Object.keys(loaders), 'text'),
      stream: !!request.stream,
      credentials: !!request.credentials,
      src: getString('src', true, ''),
      parser: parser
    }
  }).map(function (request) {
    return (loaders[request.type])(request)
  })

  function abort (message) {
    if (state === STATE_ERROR || state === STATE_COMPLETE) {
      return
    }
    state = STATE_ERROR
    pending.forEach(function (loader) {
      loader.cancel()
    })
    if (onError) {
      if (typeof message === 'string') {
        onError(new Error('resl: ' + message))
      } else {
        onError(message)
      }
    } else {
      console.error('resl error:', message)
    }
  }

  function notifyProgress (message) {
    if (state === STATE_ERROR || state === STATE_COMPLETE) {
      return
    }

    var progress = 0
    var numReady = 0
    pending.forEach(function (loader) {
      if (loader.ready) {
        numReady += 1
      }
      progress += loader.progress
    })

    if (numReady === pending.length) {
      state = STATE_COMPLETE
      onDone(assets)
    } else {
      if (onProgress) {
        onProgress(progress / pending.length, message)
      }
    }
  }

  if (pending.length === 0) {
    setTimeout(function () {
      notifyProgress('done')
    }, 1)
  }
}

},{}],96:[function(require,module,exports){
module.exports = require('insert-css')

},{"insert-css":76}],97:[function(require,module,exports){
(function (global){(function (){
'use strict'

var bits = require('bit-twiddle')
var dup = require('dup')
var Buffer = require('buffer').Buffer

//Legacy pool support
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8     : dup([32, 0])
    , UINT16    : dup([32, 0])
    , UINT32    : dup([32, 0])
    , BIGUINT64 : dup([32, 0])
    , INT8      : dup([32, 0])
    , INT16     : dup([32, 0])
    , INT32     : dup([32, 0])
    , BIGINT64  : dup([32, 0])
    , FLOAT     : dup([32, 0])
    , DOUBLE    : dup([32, 0])
    , DATA      : dup([32, 0])
    , UINT8C    : dup([32, 0])
    , BUFFER    : dup([32, 0])
  }
}

var hasUint8C = (typeof Uint8ClampedArray) !== 'undefined'
var hasBigUint64 = (typeof BigUint64Array) !== 'undefined'
var hasBigInt64 = (typeof BigInt64Array) !== 'undefined'
var POOL = global.__TYPEDARRAY_POOL

//Upgrade pool
if(!POOL.UINT8C) {
  POOL.UINT8C = dup([32, 0])
}
if(!POOL.BIGUINT64) {
  POOL.BIGUINT64 = dup([32, 0])
}
if(!POOL.BIGINT64) {
  POOL.BIGINT64 = dup([32, 0])
}
if(!POOL.BUFFER) {
  POOL.BUFFER = dup([32, 0])
}

//New technique: Only allocate from ArrayBufferView and Buffer
var DATA    = POOL.DATA
  , BUFFER  = POOL.BUFFER

exports.free = function free(array) {
  if(Buffer.isBuffer(array)) {
    BUFFER[bits.log2(array.length)].push(array)
  } else {
    if(Object.prototype.toString.call(array) !== '[object ArrayBuffer]') {
      array = array.buffer
    }
    if(!array) {
      return
    }
    var n = array.length || array.byteLength
    var log_n = bits.log2(n)|0
    DATA[log_n].push(array)
  }
}

function freeArrayBuffer(buffer) {
  if(!buffer) {
    return
  }
  var n = buffer.length || buffer.byteLength
  var log_n = bits.log2(n)
  DATA[log_n].push(buffer)
}

function freeTypedArray(array) {
  freeArrayBuffer(array.buffer)
}

exports.freeUint8 =
exports.freeUint16 =
exports.freeUint32 =
exports.freeBigUint64 =
exports.freeInt8 =
exports.freeInt16 =
exports.freeInt32 =
exports.freeBigInt64 =
exports.freeFloat32 = 
exports.freeFloat =
exports.freeFloat64 = 
exports.freeDouble = 
exports.freeUint8Clamped = 
exports.freeDataView = freeTypedArray

exports.freeArrayBuffer = freeArrayBuffer

exports.freeBuffer = function freeBuffer(array) {
  BUFFER[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  if(dtype === undefined || dtype === 'arraybuffer') {
    return mallocArrayBuffer(n)
  } else {
    switch(dtype) {
      case 'uint8':
        return mallocUint8(n)
      case 'uint16':
        return mallocUint16(n)
      case 'uint32':
        return mallocUint32(n)
      case 'int8':
        return mallocInt8(n)
      case 'int16':
        return mallocInt16(n)
      case 'int32':
        return mallocInt32(n)
      case 'float':
      case 'float32':
        return mallocFloat(n)
      case 'double':
      case 'float64':
        return mallocDouble(n)
      case 'uint8_clamped':
        return mallocUint8Clamped(n)
      case 'bigint64':
        return mallocBigInt64(n)
      case 'biguint64':
        return mallocBigUint64(n)
      case 'buffer':
        return mallocBuffer(n)
      case 'data':
      case 'dataview':
        return mallocDataView(n)

      default:
        return null
    }
  }
  return null
}

function mallocArrayBuffer(n) {
  var n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var d = DATA[log_n]
  if(d.length > 0) {
    return d.pop()
  }
  return new ArrayBuffer(n)
}
exports.mallocArrayBuffer = mallocArrayBuffer

function mallocUint8(n) {
  return new Uint8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocUint8 = mallocUint8

function mallocUint16(n) {
  return new Uint16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocUint16 = mallocUint16

function mallocUint32(n) {
  return new Uint32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocUint32 = mallocUint32

function mallocInt8(n) {
  return new Int8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocInt8 = mallocInt8

function mallocInt16(n) {
  return new Int16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocInt16 = mallocInt16

function mallocInt32(n) {
  return new Int32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocInt32 = mallocInt32

function mallocFloat(n) {
  return new Float32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocFloat32 = exports.mallocFloat = mallocFloat

function mallocDouble(n) {
  return new Float64Array(mallocArrayBuffer(8*n), 0, n)
}
exports.mallocFloat64 = exports.mallocDouble = mallocDouble

function mallocUint8Clamped(n) {
  if(hasUint8C) {
    return new Uint8ClampedArray(mallocArrayBuffer(n), 0, n)
  } else {
    return mallocUint8(n)
  }
}
exports.mallocUint8Clamped = mallocUint8Clamped

function mallocBigUint64(n) {
  if(hasBigUint64) {
    return new BigUint64Array(mallocArrayBuffer(8*n), 0, n)
  } else {
    return null;
  }
}
exports.mallocBigUint64 = mallocBigUint64

function mallocBigInt64(n) {
  if (hasBigInt64) {
    return new BigInt64Array(mallocArrayBuffer(8*n), 0, n)
  } else {
    return null;
  }
}
exports.mallocBigInt64 = mallocBigInt64

function mallocDataView(n) {
  return new DataView(mallocArrayBuffer(n), 0, n)
}
exports.mallocDataView = mallocDataView

function mallocBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = BUFFER[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Buffer(n)
}
exports.mallocBuffer = mallocBuffer

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    POOL.UINT8[i].length = 0
    POOL.UINT16[i].length = 0
    POOL.UINT32[i].length = 0
    POOL.INT8[i].length = 0
    POOL.INT16[i].length = 0
    POOL.INT32[i].length = 0
    POOL.FLOAT[i].length = 0
    POOL.DOUBLE[i].length = 0
    POOL.BIGUINT64[i].length = 0
    POOL.BIGINT64[i].length = 0
    POOL.UINT8C[i].length = 0
    DATA[i].length = 0
    BUFFER[i].length = 0
  }
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"bit-twiddle":7,"buffer":17,"dup":21}],98:[function(require,module,exports){
const angleNormals = require('angle-normals')
const PerlinNoise = require('perlin-noise-3d')
const perlinNoise = new PerlinNoise()

module.exports = terrainImgToMesh;

/**
 * given an ndarray of pixels, return the mesh that represents
 * the terrain, with unique cell positions that each have a single
 * elevation attributed to them
 * 
 * @param  {float} options.sampleRate   frequency to sample the pixels
 * @param  {ndarray} options.pixels     ndarray of pixels that represent an image
 * @param  {array} options.bbox          [west,south,east,north] extends of the image
 * @return {object} mesh
 * @return {float} mesh.maxElevation    the max z value for the posistions
 * @return {array} mesh.positions        [vec4(float)] representing positions in space. w/a/[3] element is the average z value for the positions that make up the cell
 * @return {array} mesh.cells             [vec3(int)]
 * @return {array} mesh.normals         [vec3(float)] cell normals
 */
function terrainImgToMesh ({
  sampleRate,
  pixels,
  bbox = [0,0,1,1],
}) {
  const xExtent = bbox[2] - bbox[0]
  const yExtent = bbox[3] - bbox[1]
  const minX = bbox[0]
  const minY = bbox[1]
  const maxY = bbox[3]

  const { positions, maxElevation } = (({ pixels, sampleRate }) => {
    const positions = []
    const imgSize = pixels.shape
    let maxElevation = 0;
    for (let i = 0; i <= sampleRate; i++) {
      for (let j = 0; j <= sampleRate; j++) {
        let x = Math.floor((imgSize[0]-1) / sampleRate * i)
        let y = Math.floor((imgSize[1]-1) / sampleRate * j)
        const r = pixels.get(x, y, 0)
        const g = pixels.get(x, y, 1)
        const b = pixels.get(x, y, 2)
        // height based on mapbox terrain tile
        const z = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
        maxElevation = Math.max(maxElevation, z)
        // west to east
        const lon = minX + (xExtent * (i / sampleRate))
        // north to south
        const lat = maxY - (yExtent * (j / sampleRate))
        positions.push([lon, lat, z])
      }
    }
    return {
      positions,
      maxElevation,
    }
  })({ pixels, sampleRate })

  // cells:start
  const cells = (({ sampleRate }) => {
    const cells = []
    // const dim =  sampleRate - 1
    // loop through all positions, except the last row
    for (let i = 0; i < positions.length; i++) {
      const x = Math.floor(i % (sampleRate + 1))
      const y = Math.floor(i / (sampleRate + 1))
      // do not wrap on the edges
      if (x === sampleRate) continue
      if (y === sampleRate) continue
      cells.push([i, i + 1, i + sampleRate + 1])
      cells.push([i + 1, i + sampleRate + 2, i + sampleRate + 1])
    }
    return cells
  })({ sampleRate })

  // n-prefix for the new positions and cells that are created so that
  // each set of positions also includes a w/a value that corresponds
  // to the elevation of the triangle. then push this unique set of
  // positions into nPositions, and add their indicies to nCells
  const { nPositions, nCells } = (({ positions, cells }) => {
    let nPositions = []
    const nCells = []
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      let cellMaxElevation = 0
      for (let j = 0; j < cell.length; j++) {
        const z = positions[cell[j]][2]
        cellMaxElevation = Math.max(z, cellMaxElevation)
        // cellMaxElevation += z
      }
      // cellMaxElevation/=3
      // add next 3 indicies as the next cell
      nCells.push([nPositions.length, nPositions.length + 1, nPositions.length + 2])
      // push the positions with their w/a value as the cell max elevation
      nPositions = nPositions.concat(
        cell.map(c => {
          // if the maxElevation is 0, then assign perlin noise elevation to
          // each of the positon valies
          if (cellMaxElevation === 0) {
            const p = positions[c]
            return [p[0], p[1], perlinNoise.get(p[0], p[1], p[2])].concat([cellMaxElevation])
          }
          return positions[c].concat([cellMaxElevation])
        })
      )
    }
    return {
      nPositions,
      nCells,
    }  
  })({ positions, cells })
  
  const normals = angleNormals(nCells, nPositions)

  return {
    maxElevation,
    positions: nPositions,
    cells: nCells,
    normals,
  }
}
},{"angle-normals":3,"perlin-noise-3d":91}]},{},[1]);
