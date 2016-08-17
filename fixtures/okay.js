delete require.cache.fs;
require('fs');
'fs' in require.cache;
require.cache.fs = require.cache.fs;
