require('dotenv').config()

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

module.exports = { generateEnv, generateDiscord, generateTelegram, generateSecret };