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
  vert: glsl(`
    precision highp float;

    attribute vec4 position;
    attribute vec3 normal;

    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex, aspect;

    varying vec4 vPosition;
    varying vec3 vNormal;

    void main () {
      vNormal = normalize(normal);
      vec2 p = position.xy + offset;
      vPosition = vec4(p.x, p.y, position.z, position.w);
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0 + zindex),
        1);
    }
  `),
  frag: glsl(`
    precision highp float;

    #pragma glslify: snoise = require(glsl-noise/simplex/3d)
    #pragma glslify: hsl2rgb = require(glsl-hsl2rgb)

    uniform float groundMaxElevation;
    uniform vec3 lightDir;
    uniform float tick;
    uniform float ambientLightAmount;
    uniform float diffusedLightAmount;

    varying vec4 vPosition;
    varying vec3 vNormal;

    float random ( vec2 st ) {
      return fract(
        sin(
          dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123
        )
      );
    }

    void main () {
      vec3 color = vec3(1,0.8,1);
      vec3 ambient = ambientLightAmount * color;
      float percentElevation = vPosition.z/groundMaxElevation;
      if (vPosition.w == 0.0) {
        color = vec3(0,0,1.0);
        float z = snoise(vec3(vPosition.x, vPosition.y, tick/200.0));
        percentElevation = z/1.0 * 0.5 + 0.5;
      }
      else {
        float cosTheta = dot(vNormal, normalize(lightDir));
        // percentElevation = cosTheta;
        // percentElevation = max(0.0, cosTheta);
        // percentElevation = vPosition.z/groundMaxElevation;
        // percentElevation = cosTheta * (vPosition.z/vPosition.w);
        // percentElevation = vPosition.z/groundMaxElevation * cosTheta + 0.2;
        percentElevation = vPosition.z/groundMaxElevation * max(0.0, cosTheta) + 0.2;
      }
      float clampedPercentElevation = clamp(percentElevation, 0.0, 1.0);
      float elevationThreshold = clampedPercentElevation - 0.00;
      vec3 diffuse = diffusedLightAmount * color * clampedPercentElevation;
      // float randomThreshold = sqrt(random(vec2(random(vPosition.xy), vPosition.zw)));
      float randomThreshold = sqrt(random(vec2(random(vPosition.xy), vec2(clampedPercentElevation))));
      // float randomThreshold = sqrt(random(vec2(clampedPercentElevation)));
      // float randomThreshold = sqrt(random(vPosition.xy));
      // float randomThreshold = sqrt(random(vec2(vPosition.zz)));
      vec3 baseColor = ambient + diffuse;
      // vec3 baseColorForCell = ambient + diffuseForCell;
      // vec3 baseColor = vec3(clampedPercentElevation);
      // if (randomThreshold < elevationThresholdForCell) {
      if (randomThreshold < elevationThreshold) {
        // gl_FragColor = vec4(1,0,1, 1);
        gl_FragColor = vec4(baseColor + vec3(clampedPercentElevation), 1);
        // gl_FragColor = vec4(baseColorForCell + vec3(clampedPercentElevation), 1);
      }
      else {
        gl_FragColor = vec4(baseColor, 1);
        // gl_FragColor = vec4(baseColorForCell, 1);
      }
    }
  `),
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
