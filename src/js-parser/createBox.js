import FTYPBox from './FTYPBox.js'
import MOOVBox from './MOOVBox.js'
import MDATBox from './MDATBox.js'
import FREEBox from './FREEBox.js'

export default function createBox(boxType, boxData) {
  switch(boxType) {
    case 'ftyp':
      return new FTYPBox(boxData)
    case 'moov':
      return new MOOVBox(boxData)
    case 'mdat':
      return new MDATBox(boxData)
    case 'free':
      return new FREEBox(boxData)
    default:
      break;
  }
}