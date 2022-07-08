// mixmap-00
// natural earth most basic render
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})

const drawNE = map.createDraw({
  vert: `
    precision highp float;

    attribute vec2 position;
    
    uniform vec4 viewbox;
    uniform vec2 offset;

    void main () {
      vec2 p = position.xy + offset;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        (p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0,
        0, 1);
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
  elements: map.prop('cells'),
})

resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne_110m_land.json',
      parser: JSON.parse,
    },
  },
  onDone: ({ neGeojson }) => {
    const neMesh = geojson2mesh(neGeojson)
    drawNE.props.push({
      positions: neMesh.triangle.positions,
      cells: neMesh.triangle.cells,
    })
    map.draw()
  },
})

window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(6,Math.round(map.getZoom()+1)))
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
