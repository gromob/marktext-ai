import path from 'path'
import { app } from 'electron'
import { setLocalesDirectory } from 'common/i18n'

// The fork owns its preferences, recovery files and single-instance lock.
app.setName('MarkText AI')
app.setPath('userData', path.join(app.getPath('appData'), 'MarkText AI'))

// A packaged app keeps `static/` beside the executable's resources; every other
// run — the dev server, `electron-vite preview`, the e2e suite — reads it from
// the app directory.
const staticPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static')

// Set `__static` path to static files in production / development depending on the environment
;(global as unknown as { __static: string }).__static = staticPath.replace(/\\/g, '\\\\')

setLocalesDirectory(path.join(staticPath, 'locales'))
