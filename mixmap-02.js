// mixmap-02
// higher res pr ne data, zoomed to pr main
// loading pr terrain rgb images
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')
const tilebelt = require('@mapbox/tilebelt')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

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

    void main () {
      gl_FragColor = vec4(1,0,0,1);
    }
  `,
  attributes: {
    position: map.prop('positions'),
  },
  uniforms: {
    zindex: map.prop('zindex'),
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


const drawTerrainTile = map.createDraw({
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

const manifest = [
  '8-80-114.pngraw',
  '8-80-115.pngraw',
  '8-81-114.pngraw',
  '8-81-115.pngraw',
]
const tiles = {}
manifest.forEach((file, id) => {
  const zTile = file.split('.')[0].split('-').map(Number)
  const tile = [zTile[1], zTile[2], zTile[0]]
  const geojson = tilebelt.tileToGeoJSON(tile)
  const bbox = geojson.coordinates[0] // [nw, sw, se, ne, nw]
  // bbox for box intersections
  // [w,s,e,n]
  tiles[`${id}!${file}`] = [bbox[0][0], bbox[1][1], bbox[2][0], bbox[0][1]]
})

map.addLayer({
  viewbox: (bbox, zoom, cb) => {
    cb(null, tiles)
  },
  add: function (key, bbox) {
    const id = key.split('!')[0]
    const file = key.split('!')[1]
    const level = Number(file.split('-')[0])
    const prop = {
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
    drawTerrainTile.props.push(prop)
    map.draw()
    resl({
      manifest: { tile: { type: 'image', src: `terrain-rgb/${file}` } },
      onDone: ({ tile }) => {
        prop.texture = map.regl.texture(tile)
        map.draw()
      },
    })
  },
  remove: (key, bbox) => {
    drawTerrainTile.props = drawTerrainTile.props.filter((p) => {
      return p.key !== key
    })
  },
})
