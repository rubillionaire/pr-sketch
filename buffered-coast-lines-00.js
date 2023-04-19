// buffered-coast-lines-00
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const geojson2mesh = require('earth-mesh')
const buffer = require('@turf/buffer')

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
  const endZoom = startZoom + deltaZoom
  let currentZoom = startZoom
  function step () {
    currentZoom += zoomIncrement
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
    const bufferDistances = [1,2,3,4,5]
    bufferDistances.forEach((bufferDistance, index) => {
      const percent = 1 - index/bufferDistances.length
      const bufferedNeMesh = geojson2mesh(buffer(neGeojson, bufferDistance, {units: 'miles'}))
      drawNE.props.push({
        positions: bufferedNeMesh.triangle.positions,
        cells: bufferedNeMesh.triangle.cells,
        color: [0,1 * percent, 0],
        zindex: 9 - index,
      })
    })
    
    const neMesh = geojson2mesh(neGeojson)
    drawNE.props.push({
      positions: neMesh.triangle.positions,
      cells: neMesh.triangle.cells,
      color: [0,0,0],
      zindex: 10,
    })
    map.draw()
  },
})

