# ESRH HL7 Front-End [![pipeline status](https://gitlab.com/esrh-tp-hl7/esrh-hl7-front-end/badges/develop/pipeline.svg)](https://gitlab.com/esrh-tp-hl7/esrh-hl7-front-end/commits/develop) [![licence](https://i.creativecommons.org/l/by-nc-sa/4.0/80x15.png)](http://creativecommons.org/licenses/by-nc-sa/4.0/)

This projects contains the front-end for the ESIR ESRH class. It presents the information available in the corresponding [back-end](https://gitlab.com/esrh-tp-hl7/esrh-hl7-back-end).

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

It has the following keys:

* **`VUE_APP_SERVER_URL`: set the address for the back-end.
* **`VUE_APP_WS_URL`: set the address for the websocket back-end.

## Docker Build

Before building your image, please specify the path to the HL7 Backend Server in *config/prod.env.js*.

    docker build -t <image-name> .

## Contributing

Contributions are welcome! If you'd like to help, please, ensure that you follows the [contribution guidelines](./CONTRIBUTING.md).
