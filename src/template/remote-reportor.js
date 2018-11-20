import io from 'socket.io-client'
import Serializer from '../serializer'

function TestParse(test) {
  console.log(test.slow)
  return {
    async: test.async,
    body: test.body,
    duration: test.duration,
    file: test.file,
    pending: test.pending,
    speed: test.speed,
    state: test.state,
    sync: test.sync,
    timedOut: test.timedOut,
    title: test.title,
    type: test.type
  }
}
function SuiteParse(suite) {
  return {
    delayed: suite.delayed,
    file: suite.file,
    pending: suite.pending,
    root: suite.root,
    title: suite.title
  }
}

export default class RmReporter {
  constructor(runner) {
    this.serilizer = new Serializer()
    const socket = io();
    ['start', 'end', 'suite', 'suite end','test', 'test end', 'hook', 'hook end', 'pass', 'fail', 'pending'].forEach(type => {
      runner.on(type, (...args) => {
        args = args.map(item => {
          return this.serilizer.serialize(item, { idOnly: true })
        })
        __mochaEmit(type, ...args)
        // args = args.map((item) => {
        //   if (item.constructor.name === 'Test') {
        //     return TestParse(item)
        //   }
        //   if (item.constructor.name === 'Suite') {
        //     return SuiteParse(item)
        //   }
        //   return item
        // })
        // //console.log(args)
        // socket.emit(type, args)
      })
    })
  }
}