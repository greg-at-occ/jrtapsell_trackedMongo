const yaml = require("node-yaml");
const _ = require("lodash");

const NUMBER_OF_SHARDS = 2;
const NUMBER_OF_NODES_PER_SHARD = 3;
const NUMBER_OF_CONFIGS = 3;
const NUMBER_OF_ROUTERS = 2;

function humanRange(count) {
    return _.range(1, count+1)
}

function forHumanRange(count, action) {
    humanRange(count).forEach(d => {action(d)})
}

function buildMongo(name, additional) {
    return _.merge({
        container_name: name,
        hostname: name,
        image: "mongo_patched",
        volumes: [
            "/etc/localtime:/etc/localtime:ro",
            `$PWD/logs/${name}.prov:/provenance`,
            `$PWD/logs/${name}.stdout:/stdout`,
            `$PWD/logs/${name}.stderr:/stderr`,
            `$PWD/keyfile:/keyfile`
        ],
        tmpfs: [
            "/data/db"
        ],
    }, additional)
}

const output = {
    version: "2",
    services: {},
    networks: {
        clusternet: {
            driver: "bridge",
            ipam: {
                config: [{
                    subnet: "10.24.0.0/16",
                    gateway: "10.24.0.1"
                }]
            }
        }
    }
};

// Shard Nodes
forHumanRange(NUMBER_OF_SHARDS, shardNumber => {
    forHumanRange(NUMBER_OF_NODES_PER_SHARD, nodeNumber => {

        const containerName = `mongo_shard${shardNumber}_node${nodeNumber}`;
        output.services[containerName] = buildMongo(containerName, {
            command: `mongod --shardsvr --replSet mongors${shardNumber} --dbpath /data/db --port 27017 --bind_ip 0.0.0.0 --keyFile /keyfile`,
            ports: [
                `127.0.0.1:271${shardNumber}${nodeNumber}:27017`
            ],
            networks: {
                clusternet: {
                    ipv4_address: `10.24.1.${shardNumber}${nodeNumber}`
                }
            }
        })
    })
});

//Config Nodes
forHumanRange(NUMBER_OF_CONFIGS, (configNumber) => {
    const name = `mongo_config${configNumber}`;
    output.services[name] = buildMongo(name, {
        command: "mongod --configsvr --replSet mongors1conf --dbpath /data/db --port 27017 --bind_ip 0.0.0.0 --keyFile /keyfile",
        ports: [
            `127.0.0.1:2720${configNumber}:27017`
        ],
        networks: {
            clusternet: {
                ipv4_address: `10.24.2.${configNumber}`
            }
        }
    })
});

// Routers and express instances
forHumanRange(NUMBER_OF_ROUTERS, (routerNumber) => {
    const nodeName = `mongos${routerNumber}`;
    output.services[nodeName] = buildMongo(nodeName, {
        depends_on: humanRange(2).map(p => `mongo_config${p}`),
        command: "mongos --configdb mongors1conf/mongo_config1:27017,mongo_config2:27017,mongo_config3:27017 --port 27017 --bind_ip 0.0.0.0 --keyFile /keyfile",
        ports: [
            `127.0.0.1:2730${routerNumber}:27017`,
            `0.0.0.0:${27016+routerNumber}:27017`
        ],
        networks: {
            clusternet: {
                ipv4_address: `10.24.3.${routerNumber}`
            }
        }
    });
    const viewerName = `mongo-express-data${routerNumber}`;
    output.services[viewerName] = {
        "container_name": viewerName,
        image: "mongo-express",
        "depends_on": [
            nodeName
        ],
        ports: [
            `127.0.0.1:808${routerNumber}:8081`
        ],
        environment: [
            "ME_CONFIG_MONGODB_ENABLE_ADMIN=true",
            `ME_CONFIG_MONGODB_SERVER=${nodeName}`,
            `ME_CONFIG_MONGODB_AUTH_DATABASE=admin`,
            `ME_CONFIG_MONGODB_ADMINUSERNAME=admin`,
            `ME_CONFIG_MONGODB_ADMINPASSWORD=password`
        ],
        networks: {
            clusternet: {
                ipv4_address: `10.24.4.${routerNumber}`
            }
        }
    }
});

//Shard viewer
output.services["shard-viewer"] = {
    container_name: "shard-viewer",
    image: "shard-viewer",
    ports: [
        "127.0.0.1:8084:3000"
    ],
    depends_on: humanRange(NUMBER_OF_CONFIGS).map(p => `mongo_config${p}`),
    networks: {
        clusternet: {
            ipv4_address: `10.24.5.1`
        }
    }
};

yaml.writeSync("../cluster/mongo-sharded/docker-compose.yml", output);
