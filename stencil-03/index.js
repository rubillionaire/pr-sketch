// stencil-01
// - proof of concept using the regl of mixmap to do stencil buffer work.
// - 01
// - add depth buffer testing to the mix, seems to be the source of things 
// not rendering correctly in mixmap
// - 02
// - stencil props now get the correct result
// - 03
// - wip, can we get this to work outside of the context of a frame callback
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

const url = new URL(window.location)
const urlSearch = new URLSearchParams(url.search)

const useSquareGeom = urlSearch.get('geom') === 'tile'
  ? false
  : true
const honorStencil = urlSearch.get('stencil') === 'false'
  ? false
  : true
const useFrameTick = urlSearch.get('tick') === 'false'
  ? false
  : true
const inlineStencilProps = urlSearch.get('inline') === 'false'
  ? false
  : true

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

const createMaskProps = {
  stencil: {
    enable: true,
    mask: 0xff,
    // if a fragment is covered, set that fragment to 1 in the stencil buffer.
    func: {
      cmp: 'always',
      ref: 1,
      mask: 0xff
    },
    op: {
      fail: 'keep',
      zfail: 'keep',
      zpass: 'replace'
    },
  },
  // we want to write only to the stencil buffer,
  // so disable these masks.
  colorMask: [false, false, false, false],
  depth: {
    enable: false,
    mask: false,
  },
}

const createMask = map.regl(createMaskProps)

const honorMaskProps = {
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'equal',
      ref: 1,
      mask: 0xff
    },
    op: {
      fail: 'keep',
      zfail: 'keep',
      zpass: 'replace'
    },
  },
  depth: {
    enable: true,
    mask: true,
    func: 'less',
  },
}

// pass stencil test only if value in stencil buffer is 1.
const honorMask = map.regl(honorMaskProps)

const glPosition = useSquareGeom
  ? `float x = position.x;
      float y = position.y;
      float z = 0.0;
      x = clamp(x, -1., 1.);
    y = clamp(y, -1., 1.);
      gl_Position = vec4(x, y, z, 1);`
  : `
    vec2 p = position.xy + offset;
    float x = (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0;
    float y = ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect;
    float z = 0.0;
    x = clamp(x, -1., 1.);
    y = clamp(y, -1., 1.);
    gl_Position = vec4(x, y, z, 1);
    `

const drawToMaskProps = {
  attributes: {
    position: map.regl.prop('positions'),
  },
  elements: map.prop('cells'),
  uniforms: {
    viewbox: map.prop('viewbox'),
    offset: map.prop('offset'),
    aspect: function (context) {
      return context.viewportWidth / context.viewportHeight
    },
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float aspect;
    varying vec4 vpos;
    void main () {
      ${glPosition}
      vpos = gl_Position.xyzw;
    }
  `,
  frag: `
    precision highp float;
    varying vec4 vpos;
    void main () {
      gl_FragColor = vec4(vpos.xyz, 1.0);
      // gl_FragColor = vec4(vpos.xy, 0, 1.0);
      // gl_FragColor = vec4(1.0);
    }
  `,
}
if (inlineStencilProps) {
  Object.assign(drawToMaskProps, createMaskProps)
}

const drawToMask = map.regl(drawToMaskProps)

let drawPositionProps = {
  attributes : {
    position: map.regl.prop('positions'),
  },
  elements: map.prop('cells'),
  uniforms: {
    zindex: map.prop('zindex'),
    viewbox: map.prop('viewbox'),
    offset: map.prop('offset'),
    aspect: function (context) {
      return context.viewportWidth / context.viewportHeight
    },
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex, aspect;
    varying vec4 vpos;
    void main () {
      ${glPosition}
      vpos = gl_Position.xyzw;
    }
  `,
  frag: `
    precision highp float;
    varying vec4 vpos;

    void main () {
      // vec3 color = vec3(1.0, 0.0, 1.0);
      vec3 color = vpos.xyz;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

if (inlineStencilProps) {
  Object.assign(drawPositionProps, honorMaskProps)
}

const drawPosition = map.regl(drawPositionProps)

const color = [0.5,0.5,0.5,1]
const tileBbox = [-66.796875, 17.97873309555615, -66.09375, 18.64624514267062]

const markProps = Object.assign({},
  map._props()[0],
  useSquareGeom ? squareToMesh(smallerSquare) : null,
  useSquareGeom ? null : bboxToMesh(tileBbox)
)
const drawProps = Object.assign({ zindex: 1 },
  map._props()[0],
  useSquareGeom ? squareToMesh(largeSquare) : null,
  useSquareGeom ? null : bboxToMesh(map.viewbox.slice())
)

const frameHonorStencil = () => {
  map.regl.poll()
  map.regl.clear({
    color,
    stencil: 0,
    depth: 1,
  })
  
  createMask(() => {
    drawToMask(markProps)
  })
  honorMask(() => {
    drawPosition(drawProps)  
  })
}

const frameNoStencil = () => {
  map.regl.clear({
    color,
    depth: 1,
  })

  drawToMask(markProps)
  drawPosition(drawProps)
}

const frameStencilInline = () => {
  map.regl.poll()
  map.regl.clear({
    color,
    depth: 1,
    stencil: 0,
  })

  drawToMask(markProps)
  drawPosition(drawProps)
}

const onframe = inlineStencilProps
  ? frameStencilInline
  : honorStencil
    ? frameHonorStencil
    : frameNoStencil

if (useFrameTick) {
  const frameTick = map.regl.frame(onframe)  
  console.log({frameTick})
}
else {
  setTimeout(() => {
    console.log('delayed')
    onframe()
  }, 1000)
}

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

function squareToMesh (square) {
  return {
    positions: square.flat(),
    cells: [
      0, 1, 2,
      3, 4, 5
    ],
  }
}

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

function fullTileMesh () {
  const bbox = [-180, -90, 180, 90]
  return bboxToMesh(bbox)
}
