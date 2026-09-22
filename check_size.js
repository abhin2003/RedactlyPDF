const sizeOf = require('image-size');
const dimensions = sizeOf('public/logo-white.png');
console.log(dimensions.width, dimensions.height);
