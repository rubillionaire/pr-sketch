// pmtiles-00
// - used to debug MixmapPMTiles
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const { default: MixmapPMTiles, TileType, RasterShaders } = require('mixmap-pmtiles')
const { default: tileGrid } = require('mixmap-tile-grid')
const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
  attributes: {
    stencil: true,
  },
})

const colorRgb = {
  green: [97, 192, 113],
  blue: [26, 114, 187],
  white: [255, 255, 255],
}
const colorGlsl = {}
for (const color in colorRgb) {
  colorGlsl[color] = colorRgb[color].map(c => c/255)
}

function prViewbox () {
  const prWE = [-67.356661, -65.575714] 
  const prCenter = 18.220148006000038
  // screen height/width = prHeight/prWidth
  // screen height/width  * prWidth = prHeight
  const prHorizontal = (prWE[1] - prWE[0])
  const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
  const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]
  const viewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
  return viewbox
}

const map = mix.create({
  viewbox: prViewbox(),
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
  new MixmapPMTiles(map, {
    // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/pr.osm-z20.pmtiles',
    source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/pr.osm.pmtiles',
    // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/pr-tile-simplified.pmtiles',
    // source: './pmtiles/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles',
    // source: './pmtiles/terrain-dem-Z8-z12.pmtiles',
    // source: './pmtiles/terrain-dem-v1-clipped-pr.pmtiles',
    // source: './pmtiles/tmp-dem-clipped.pmtiles',
    tileType: TileType.Mvt,
    style,
  })
}
style.src = './style-textures/isolate-place-island.png'
// style.src = './style-textures/flaneur-yuv.png'

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

function bboxToMesh (bbox) {
  return {
    positions: [
      bbox[0], bbox[1],
      bbox[0], bbox[3],
      bbox[2], bbox[3],
      bbox[0], bbox[1],
      bbox[2], bbox[3],
      bbox[2], bbox[1]
    ],
    cells: [0, 1, 2, 3, 4, 5]
  }
}

function fullEarthMesh () {
  const bbox = [-180, -90, 180, 90]
  return bboxToMesh(bbox)
}
