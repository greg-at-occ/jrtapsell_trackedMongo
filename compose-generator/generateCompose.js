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
    humanRange(count)
        .forEach(d => {
            action(d)
        })
}
const output = {
    version: "2",
    services: {}
};

// Shard Nodes
forHumanRange(NUMBER_OF_SHARDS, shardNumber => {
    forHumanRange(NUMBER_OF_NODES_PER_SHARD, nodeNumber => {

        const containerName = `mongo_shard${shardNumber}_node${nodeNumber}`;
        output.services[containerName] = {
            container_name: containerName,
            image: "mongo_patched",
            command: `mongod --shardsvr --replSet mongors${shardNumber} --dbpath /data/db --port 27017`,
            volumes: [
                "/etc/localtime:/etc/localtime:ro",
                `$PWD/logs/mongo_shard${shardNumber}_node${nodeNumber}.prov:/provenance`,
                `$PWD/logs/mongo_shard${shardNumber}_node${nodeNumber}.stdout:/stdout`,
                `$PWD/logs/mongo_shard${shardNumber}_node${nodeNumber}.stderr:/stderr`
            ],
            ports: [
                `271${shardNumber}${nodeNumber}:27017`
            ],
            tmpfs: [
                "/data/db"
            ]
        }
    })
});

//Config Nodes
forHumanRange(NUMBER_OF_CONFIGS, (configNumber) => {
    const name = `mongo_config${configNumber}`;
    output.services[name] = {
        container_name: name,
        image: "mongo_patched",
        command: "mongod --configsvr --replSet mongors1conf --dbpath /data/db --port 27017",
        volumes: [
            "/etc/localtime:/etc/localtime:ro",
            `$PWD/logs/mongo_config${configNumber}.prov:/provenance`,
            `$PWD/logs/mongo_config${configNumber}.stdout:/stdout`,
            `$PWD/logs/mongo_config${configNumber}.stderr:/stderr`,
        ],
        ports: [
            `2720${configNumber}:27017`
        ],
        tmpfs: [
            "/data/db"
        ]
    }
});

forHumanRange(NUMBER_OF_ROUTERS, (routerNumber) => {
    const nodeName = `mongos${routerNumber}`;
    output.services[nodeName] = {
        container_name: nodeName,
        image: "mongo_patched",
        depends_on: humanRange(2).map(p => `mongo_config${p}`),
        command: "mongos --configdb mongors1conf/mongo_config1:27017,mongo_config2:27017,mongo_config3:27017 --port 27017 --bind_ip 0.0.0.0",
        ports: [
            `2730${routerNumber}:27017`
        ],
        volumes: [
            "/etc/localtime:/etc/localtime:ro",
            `$PWD/logs/mongos${routerNumber}.prov:/provenance`,
            `$PWD/logs/mongos${routerNumber}.stdout:/stdout`,
            `$PWD/logs/mongos${routerNumber}.stderr:/stderr`
        ],
        tmpfs: [
            "/data/db"
        ]
    };
});

output.services["shard-viewer"] = {
    container_name: "shard-viewer",
    image: "shard-viewer",
    ports: [
        "8084:3000"
    ],
    depends_on: humanRange(NUMBER_OF_CONFIGS).map(p => `mongo_config${p}`)
};
output.services["mongo-express-config"] = {
    container_name: "mongo-express-config",
    image: "mongo-express",
    depends_on: humanRange(NUMBER_OF_CONFIGS).map(p => `mongo_config${p}`),
    ports: [
        "8083:8081"
    ],
    environment: [
        "ME_CONFIG_MONGODB_ENABLE_ADMIN=true",
        "ME_CONFIG_MONGODB_SERVER=mongo_config1,mongo_config2,mongo_config3"
    ]
};




console.log(JSON.stringify(output))
console.log(JSON.stringify(yaml.readSync("./target.yml")))

yaml.writeSync("../cluster/mongo-sharded/docker-compose.yml", output)



