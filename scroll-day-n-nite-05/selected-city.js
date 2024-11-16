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
      ? `${selectedCity.city} is the ${selectedCity.rankFormatted} most populated city with a population of ${selectedCity.populationFormatted}.`
      : 'Scroll to highlight each city on the map.'
  }
 
  update ({ selectedCity }) {
    this.element.innerText = this.format({ selectedCity })
    return false
  }
 
  createElement ({ selectedCity }) {
    return html`<p>${this.format({ selectedCity })}</p>`
  }
}
