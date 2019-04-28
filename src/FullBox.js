import BasicBox from './BasicBox.js'
import {
  toDigitFromUint8Array,
} from './utils.js'

export default class FullBox extends BasicBox {
  constructor(data) {
    super(data)

    this._parseData(this.data)
  }

  _parseData(data) {
    super._parseData(data)
    
    this.version = toDigitFromUint8Array(data.slice(8, 9))
    // todo
    this.flags = data.slice(9, 12)
  }
}