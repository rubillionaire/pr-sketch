const html = require('choo/html')
const Component = require('choo/component')

module.exports = class SelectedCity extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = state.components[id] = {}
  }

  load (element) {

  }

  unload () {
    
  }

  format ({ selectedCity }) {
    return selectedCity
      ? `${selectedCity.city} has a population of ${selectedCity.population}`
      : ' '
  }
 
  update ({ selectedCity }) {
    this.element.innerText = this.format({ selectedCity })
    return false
  }
 
  createElement ({ selectedCity }) {
    return html`<p>${this.format({ selectedCity })}</p>`
  }
}
