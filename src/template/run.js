
import RmReporter from './remote-reportor'
const runner = mocha.run()
new RmReporter(runner)