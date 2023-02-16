/**
 * mixmap-pr-speckle-04
 * - attempt at getting the speckle pattern
 * - 1 - getting a decent first pass
 * - 2 - perlin noise for water
 * - 3 - up the sample rate just to see how the speckle changes, its nice
 * - 4 - light direction for the land to animate it, first draft, not great
 * ? light direction for the land to animate it?
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
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})

// setup-map:start
let zoomer = null
window.addEventListener('keydown', function (ev) {
  if (zoomer) {
    zoomer.cancel()
    zoomer = null
  }
  if (ev.code === 'Equal') {
    zoomer = animateLinearZoom(map.getZoom(), 1, (curr,end)=>curr>=end)
    zoomer.step()
    // map.setZoom(Math.min(10,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    // map.setZoom(map.getZoom()-1)
    zoomer = animateLinearZoom(map.getZoom(), -1, (curr,end)=>curr<=end)
    zoomer.step()
  }
})
function animateLinearZoom (startZoom, deltaZoom, isFinished) {
  let cancel = false
  const frames = 60
  const zoomIncrement = deltaZoom/frames
  console.log('zoomIncrement:', zoomIncrement)
  const endZoom = startZoom + deltaZoom
  let currentZoom = startZoom
  function step () {
    currentZoom += zoomIncrement
    console.log('currentZoom:', currentZoom)
    map.setZoom(currentZoom)
    if (isFinished(currentZoom, endZoom) || cancel) return
    window.requestAnimationFrame(step)
  }
  return {
    step,
    cancel: () => {
      cancel = true
    },
  }
}

window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))
// setup-map:end


const drawTerrainImgTile = map.createDraw({
  vert: `
    precision highp float;

    attribute vec2 position;
    attribute vec2 tcoord;
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex;
    varying vec2 vtcoord;

    void main () {
      vec2 p = position + offset;
      vtcoord = tcoord;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        (p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0,
        1.0/(1.0 + zindex),
        1.0
      );
    }
  `,
  frag: `
    precision highp float;

    uniform sampler2D texture;

    varying vec2 vtcoord;

    void main () {
      vec4 tc = texture2D(texture, vtcoord);
      gl_FragColor = vec4(tc.rgb, 1.0);
    }
  `,
  attributes: {
    position: map.prop('points'),
    tcoord: [ // sw, se, nw, ne
      0, 1,
      0, 0,
      1, 1,
      1, 0
    ],
  },
  elements: [
    0, 1, 2,
    1, 2, 3
  ],
  uniforms: {
    zindex: map.prop('zindex'),
    texture: map.prop('texture'),
  },
  blend: {
    enable: true,
    func: { src: 'src alpha', dst: 'one minus src alpha' },
  },
})
const lightDir = [0,0,1]
const drawTerrainMeshTile = map.createDraw({
  vert: glsl(`
    precision highp float;

    attribute vec4 position;
    attribute vec3 normal;

    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex;

    varying vec4 vPosition;
    varying vec3 vNormal;

    void main () {
      vNormal = normalize(normal);
      vec2 p = position.xy + offset;
      vPosition = vec4(p.x, p.y, position.z, position.w);
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        (p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0,
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
        float z = snoise(vec3(vPosition.x, vPosition.y, tick/1000.0));
        percentElevation = z/1.0 * 0.5 + 0.5;
      }
      else {
        float cosTheta = dot(vNormal, normalize(lightDir));
        // percentElevation = cosTheta;
        // percentElevation = vPosition.z/groundMaxElevation;
        // percentElevation = cosTheta * (vPosition.z/vPosition.w);
        percentElevation = vPosition.z/groundMaxElevation * cosTheta + 0.2;
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
      lightDir[0] = Math.sin(tick/100) * 180
      return lightDir
    },
    tick: ({ tick }) => tick,
    ambientLightAmount: 0.3,
    diffusedLightAmount: 0.7,
  },
  elements: map.prop('cells'),
})

const manifestImg = [
  '8-80-114.pngraw',
  '8-80-115.pngraw',
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

// const manifestMesh = [
//   `8-80-114.s${sampleRate}.json`,
//   `8-80-115.s${sampleRate}.json`,
//   `8-81-114.s${sampleRate}.json`,
//   `8-81-115.s${sampleRate}.json`,
// ]
// const tilesMesh = {}
// manifestMesh.forEach((file, id) => {
//   const zTile = file.split('.')[0].split('-').map(Number)
//   const tile = [zTile[1], zTile[2], zTile[0]]
//   const geojson = tilebelt.tileToGeoJSON(tile)
//   const bbox = geojson.coordinates[0]
//   tilesMesh[`${id}!${file}`] = [bbox[0][0], bbox[1][1], bbox[2][0], bbox[0][1]]
// })

// tile image layer
let maxElevation = 0.1
map.addLayer({
  viewbox: (bbox, zoom, cb) => {
    cb(null, tilesImg)
  },
  add: function (key, bbox) {
    const id = key.split('!')[0]
    const file = key.split('!')[1]
    const level = Number(file.split('-')[0])
    const propImg = {
      id,
      zindex: 2 + level,
      texture: map.regl.texture(),
      points: [
        bbox[0], bbox[1], // sw
        bbox[0], bbox[3], // se
        bbox[2], bbox[1], // nw
        bbox[2], bbox[3], // ne
      ],
    }
    // drawTerrainImgTile.props.push(propImg)
    // map.draw()
    resl({
      manifest: { tile: { type: 'image', src: `terrain-rgb/${file}` } },
      onDone: ({ tile }) => {
        propImg.texture = map.regl.texture(tile)
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
  },
  remove: (key, bbox) => {
    drawTerrainImgTile.props = drawTerrainImgTile.props.filter((p) => {
      return p.key !== key
    })
  },
})

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
