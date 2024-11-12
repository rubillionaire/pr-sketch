const Component = require('choo/component')

module.exports = class MapFillParent extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = state.components[id] = {}
  }

  resize () {
    const parent = this.element.parentNode
    const bbox = parent.getBoundingClientRect()
    if (!bbox) return
    this.local.map.resize(bbox.width, bbox.height)
  }

  load (element) {
    this.resize()
    const controller = new AbortController()
    const signal = controller.signal
    this.local.controller = controller
    window.addEventListener('resize', () => this.resize(), { signal })
  }

  unload () {
    if (this.local.controller?.abort) {
      this.local.controller.abort()
    }
  }
 
  update () {
    return false
  }
 
  createElement ({ map, props }) {
    this.local.map = map
    return map.render(props)
  }
}
