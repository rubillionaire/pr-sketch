// pmtiles-00
// - used to debug MixmapPMTiles
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')
const { default: MixmapPMTiles } = require('mixmap-pmtiles')
const { default: tileGrid } = require('mixmap-tile-grid')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
  attributes: {
    stencil: true,
  },
})

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]
const viewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
console.log({viewbox})

const map = mix.create({
  viewbox,
  backgroundColor: [0.5, 0.5, 0.5, 1.0],
  clear: {
    color: [0.5, 0.5, 0.5, 1.0],
    depth: 1,
    stencil: 0,
  },
})

tileGrid(map, { zindex: 1 })

var style = new Image
style.onload = function () {
  const tiles = new MixmapPMTiles(map, {
    source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/pr.osm.pmtiles',
    // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/pr-tile-simplified.pmtiles',
    style,
    filterFeature: (feature) => {
      const isIsland = feature.properties?.place === 'island'
      return isIsland
    },
  })
}
// style.src = './style-textures/isolate-place-island.png'
style.src = './style-textures/flaneur-yuv.png'


// const drawNE = map.createDraw({
//   vert: `
//     precision highp float;

//     attribute vec2 position;
    
//     uniform vec4 viewbox;
//     uniform vec2 offset;
//     uniform float aspect, zindex;

//     void main () {
//       vec2 p = position.xy + offset;
//       gl_Position = vec4(
//         (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
//         ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
//         zindex, 1);
//     }
//   `,
//   frag: `
//     precision highp float;

//     void main () {
//       gl_FragColor = vec4(1,0,0,1);
//     }
//   `,
//   attributes: {
//     position: map.prop('positions'),
//   },
//   uniforms: {
//     aspect: ({ viewportWidth, viewportHeight }) => viewportWidth/viewportHeight,
//     zindex: -2, // put it below everything else, toggle up to see it over the pmtiles data
//   },
//   elements: map.prop('cells'),
// })

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
    // drawNE.props.push({
    //   positions: neMesh.triangle.positions,
    //   cells: neMesh.triangle.cells,
    // })
    // map.draw()
  },
})

window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(20,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    map.setZoom(map.getZoom()-1)
  }
  console.log('zoom', map.getZoom())
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
