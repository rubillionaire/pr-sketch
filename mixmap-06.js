// mixmap-06
// adds more movement to the water, and makes it cell
// based to match how each cell has a single height
// for the land. not convinced the noise for the water
// is the right way to go. but its decent for now
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

const sampleRate = 32

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
window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(10,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    map.setZoom(map.getZoom()-1)
  }
})
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

const drawNE = map.createDraw({
  vert: `
    precision highp float;

    attribute vec2 position;
    
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex;
    uniform float aspect;

    void main () {
      vec2 p = position.xy + offset;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        (p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0,
        1.0/(1.0 + zindex),
        1);
    }
  `,
  frag: `
    precision highp float;

    uniform vec3 color;

    void main () {
      gl_FragColor = vec4(color,1);
    }
  `,
  attributes: {
    position: map.prop('positions'),
  },
  uniforms: {
    zindex: map.prop('zindex'),
    color: (context, props) => {
      if (props.color) return props.color
      else return [1,0,0]
    },
  },
  elements: map.prop('cells'),
})

resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne-10m-land-pr.json',
      parser: JSON.parse,
    },
  },
  onDone: ({ neGeojson }) => {
    const neMesh = geojson2mesh(neGeojson)
    // let prSN = [100, 0]
    // neMesh.triangle.positions.forEach(([x, y]) => {
    //   prSN[0] = Math.min(prSN[0], y)
    //   prSN[1] = Math.max(prSN[1], y)
    // })
    // console.log('pr-south-north-extent')
    // console.log(prSN)
    // console.log('pr-vertical-midpoint')
    // console.log((prSN[0] + prSN[1])/2)
    drawNE.props.push({
      positions: neMesh.triangle.positions,
      cells: neMesh.triangle.cells,
      zindex: 1,
    })
    map.draw()
  },
})


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
      vPosition = position;
      vNormal = normal;
      vec2 p = position.xy + offset;
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
    uniform vec3 lightSource;
    uniform float tick;

    varying vec4 vPosition;
    varying vec3 vNormal;

    const float waterMaxElevatoin = 1.0;
    // hsl(214, 100%, 30%)
    const vec3 waterLow = vec3(214.0/360.0, 1.0, 0.3);
    // hsl(214, 100%, 50%)
    const vec3 waterHigh = vec3(214.0/360.0, 1.0, 0.5);
    // hsl(96, 100%, 40%)
    const vec3 groundLow = vec3(96.0/360.0, 1.0, 0.4);
    // hsl(96, 100%, 50%)
    const vec3 groundHigh = vec3(96.0/360.0, 1.0, 0.5);

    void main () {
      float maxElevation = groundMaxElevation;
      vec3 colorLow = groundLow;
      vec3 colorHigh = groundHigh;
      float currentElevation = vPosition.w;
      // overrides for water
      if (vPosition.w <= 0.0) {
        colorLow = waterLow;
        colorHigh = waterHigh;
        maxElevation = waterMaxElevatoin;
        // elevation is a fluction based on perlin noise, lets flucatuate it
        // in order to make it a bit more dynamic
        currentElevation = vPosition.z * (sin(tick/100.0) * 0.5 + 0.5);
      };
      vec3 normal = normalize(vNormal);
      vec3 elevationColor = mix(
        colorLow,
        colorHigh,
        currentElevation/maxElevation
      );
      float lightAlignment = max(0.0, dot(lightSource, normal));
      elevationColor.z = elevationColor.z - ((1.0 - lightAlignment) * 0.1);
      gl_FragColor = vec4(hsl2rgb(elevationColor), 1);
      // gl_FragColor = vec4(elevationColor, 1);
      // gl_FragColor = vec4(1,1,0,1);
    }
  `),
  attributes: {
    position: map.prop('positions'),
    normal: map.prop('normals'),
  },
  uniforms: {
    groundMaxElevation: map.prop('maxElevation'),
    zindex: map.prop('zindex'),
    lightSource: ({ tick }) => {
      // attempt to mimic sun rise in the east, sun set in the west
      const lightSource = [1,0,0]
      const rotated = vec3.rotateY([], lightSource, [0,0,0], tick/100)
      return rotated
    },
    tick: ({ tick }) => tick,
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

// draw the tiles that the images cover based on tilebelt
// drawNE.props.push(tileQuads)
// map.draw()

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
    drawTerrainImgTile.props.push(propImg)
    map.draw()
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

// tile mesh layer
// map.addLayer({
//   viewbox: (bbox, zoom, cb) => {
//     cb(null, tilesMesh)
//   },
//   add: (key, bbox) => {
//     console.log(bbox)
//     const id = key.split('!')[0]
//     const file = key.split('!')[1]
//     const level = Number(file.split('-')[0])
//     const prop = {
//       id,
//       key,
//       zindex: 3 + level,
//       maxElevation,
//       positions: [],
//       cells: [],
//       normals: [],
//     }
//     resl({
//       manifest: { mesh: { type: 'text', src: `terrain-rgb/${file}`, parser: JSON.parse } },
//       onDone: ({ mesh }) => {
//         prop.maxElevation = maxElevation = Math.max(maxElevation, mesh.maxElevation)
//         prop.positions = mesh.positions
//         prop.cells = mesh.cells
//         prop.normals = mesh.normals

//         drawTerrainMeshTile.props.push(prop)
//         map.draw()
//       },
//     })
//   },
//   remove: (key, bbox) => {
//     drawTerrainMeshTile.props = drawTerrainMeshTile.props.filter(p => p.key !== key)
//   },
// })

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
