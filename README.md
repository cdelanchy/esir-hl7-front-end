# ESRH HL7 Front-End

This projects contains the front-end for the ESIR ESRH class. It presents the information available in the corresponding back-end.

## Build Setup

``` bash
# install dependencies
npm install

# serve with hot reload at localhost:8080
npm run dev

# build for production with minification
npm run build

# build for production and view the bundle analyzer report
npm run build --report
```

## Environment

You can specify the URL of the HL7 Backend server in *config/dev.env.js* of *config/prod.env.js* depending on your environment.

## Docker Build

Before building your image, please specify the path to the HL7 Backend Server in *config/prod.env.js*.

```
docker build -t <image-name> .
```

