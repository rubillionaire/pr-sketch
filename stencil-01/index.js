// stencil-01
// - proof of concept using the regl of mixmap to do stencil buffer work.
// - 01
// - add depth buffer testing to the mix, seems to be the source of things 
// not rendering correctly in mixmap
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')

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
})

const largeSquare = [
  // top left triangle
  [-2, 2],
  [-2, -2],
  [2, 2],
  // bottom right triangle
  [-2, -2],
  [2, -2],
  [2, 2],
]

const smallerSquare = [
  // top left triangle
  [-0.5, 0.5],
  [-0.5, -0.5],
  [0.5, 0.5],
  // bottom right triangle
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
]

const createMask = map.regl({
  stencil: {
    enable: true,
    mask: 0xff,
    // if a fragment is covered, set that fragment to 1 in the stencil buffer.
    func: {
      cmp: 'always',
      ref: 1,
      mask: 0xff
    },
    opFront: {
      fail: 'replace',
      zfail: 'replace',
      zpass: 'replace'
    }
  },
  // we want to write only to the stencil buffer,
  // so disable these masks.
  colorMask: [false, false, false, false],
  depth: {
    enable: false,
    mask: false,
  },
})

// pass stencil test only if value in stencil buffer is 1.
const honorMask = map.regl({
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'equal',
      ref: 1,
      mask: 0xff
    },
  },
  depth: {
    enable: true,
    mask: true,
  },
})

const drawToMask = map.regl({
  attributes: {
    position: map.regl.prop('positions'),
  },
  count: (c, p) => p.positions.length,
  vert: `
    precision highp float;
    attribute vec2 position;

    void main () {
      gl_Position = vec4(position * vec2(0.5), 0, 1);
    }
  `,
  frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1.0);
    }
  `,
})

const drawPosition = map.regl({
  attributes : {
    position: map.regl.prop('positions'),
  },
  uniforms: {
    tick: ({ tick }) => tick,
  },
  count: (c, p) => p.positions.length,
  vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 vPosition;

    void main () {
      gl_Position = vec4(position, 0.8, 1);
      vPosition = position;
    }
  `,
  frag: `
    precision highp float;
    uniform float tick;
    varying vec2 vPosition;

    void main () {
      vec3 color = vec3(vPosition, sin(tick/100.0) * 0.5 + 0.5);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})

const color = [1,1,1,1]
map.regl.clear({ color, depth: true })

map.regl.frame(() => {
  map.regl.clear({
    color,
    stencil: 0,
    depth: 1,
  })

  createMask(() => {
    drawToMask({ positions: smallerSquare })
  })

  honorMask(() => {
    drawPosition({ positions: largeSquare })  
  })
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
