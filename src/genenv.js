const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

require('dotenv').config()

const imageModes = () => {
    const yamlFilePath = path.join(__dirname, 'image_modes.yml');
    const jsonImageModes = fs.readFileSync(yamlFilePath, 'utf-8');

    return yaml.dump(jsonImageModes);
}

const generateEnv = (data) => {
    
    const name = data.bot_name;
    delete data.bot_name;

    let configMap = {};

    // Convert the key for the .env to uppercase
    Object.keys(data).forEach((e) => {
        configMap[e.toUpperCase()] = data[e] 
    });

    return { name, configMap };
};

const generateFeatures = (data, podname) => {
    return {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: `${podname}-features`
        },
        data: {
          "features.yml": data,
          "image_modes.yml": imageModes()
        }
      }
      
}


const generateTelegram = (name, image) => {
  return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
          name: name,
          labels: { app: name }
      },

      spec: {
          replicas: Number(process.env.REPLICAS),
          selector: {
              matchLabels: {
                  app: name
              }
          },
          template: {
              metadata: {
                  labels: {
                      app: name
                  },
                  annotations: {
                     "reloader.stakater.com/auto": "true"
                  }
              },
              spec: {
                  containers: [{
                      name: 'echobot-telegram', 
                      image: image,
                      imagePullPolicy: 'Always',  
                      volumeMounts: 
                          [
                            {
                                name: 'telegram-packages',
                                mountPath: '/app/packages',
                            }
                            ,
                            {
                                name: `${name}-config`,
                                mountPath: '/app/config',
                            }
                          ],                        
                      envFrom: [
                        {
                          configMapRef: {
                              name: `${name}-configmap`
                          }
                        },
                        {
                          secretRef: {
                              name: 'global-values'
                          }
                      }]
                  }],

                  volumes: [
                    {
                        name: 'telegram-packages',
                        persistentVolumeClaim: { claimName: 'disclaim' }
                    }
                    ,
                    {
                        name: `${name}-config`,
                        configMap: { name: `${name}-features` }
                    }
                  ]

                  // restartPolicy: "OnFailure"
              }
          }
      }
  }
};

const generateDiscord = (name, image, type) => {
    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name: name,
            labels: { app: name }
        },

        spec: {
            replicas: Number(process.env.REPLICAS),
            selector: {
                matchLabels: {
                    app: name
                }
            },
            template: {
                metadata: {
                    labels: {
                        app: name
                    },
                    annotations: {
                       "reloader.stakater.com/auto": "true"
                    }
                },
                spec: {
                    containers: [{
                        name: 'echobot-discord',
                        image: image,
                        imagePullPolicy: 'Always',
                        volumeMounts: 
                          [
                            {
                            name: 'discord-packages',
                            mountPath: '/app/packages',
                            }
                          ],                        
                        envFrom: [
                          {
                            configMapRef: {
                                name: `${name}-configmap`
                            }
                          },
                          {
                            secretRef: {
                                name: 'global-values'
                            }
                        }]
                    }],

                    volumes: [
                      {
                        name: 'discord-packages',
                        persistentVolumeClaim: { claimName: 'disclaim' }
                      }
                    ]
                    // restartPolicy: "OnFailure"
                }
            }
        }
    }
};

const generateSecret = (data, namespace) => {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: 'global-values',
      namespace: namespace,
    },
    type: 'Opaque', 
    data: data,
  };
}

module.exports = { generateEnv, generateDiscord, generateTelegram, generateSecret, generateFeatures };