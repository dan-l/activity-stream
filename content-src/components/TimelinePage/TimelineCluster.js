const React = require("react");
const {connect} = require("react-redux");
const {selectHistoryBookmarks} = require("selectors/selectors");

const TimelineCluster = React.createClass({
  getInitialState() {
    return {
      output: "Clustering an activity"
    };
  },
  collectWordMatrix(source) {
    // make an object with urls the key and array of keywords the value
    return source
      .filter((s) => !/google/.test(s.url))
      .reduce((acc, h) => {
        const entry = {};
        const url = h.url.toLowerCase().replace(/\b(http|https|www|co|ca|com|org)\b/g, "");
        const title = h.title.toLowerCase();
        entry[h.url] = url.split(/[^A-Z^a-z^]+/).concat(title.split(/[^A-Z^a-z]+/)).filter((w) => !!w);
        return Object.assign(acc, entry);
    }, {});
  },
  computeAllWords(wordMatrix) {
    const allWords = [];
    for(const key in wordMatrix) {
      wordMatrix[key].forEach((word) => { if (allWords.indexOf(word) === -1) allWords.push(word); });
    }
    return allWords;
  },
  transformVectors(allColumns, vec) {
    return allColumns.map((col) => vec.reduce((acc, curr) => acc + (col === curr) | 0, 0));
  },
  sum(list) {
    return list.reduce((memo, num) => {
        return memo + num;
    }, 0);
  },
  pearson(v1, v2) {
    let size = v1.length;

    let sum1 = this.sum(v1);
    let sum2 = this.sum(v2);

    let sumOfSquares1 = this.sum(v1.map((v) => {
        return Math.pow(v, 2);
    }));
    let sumOfSquares2 = this.sum(v2.map((v) => {
        return Math.pow(v, 2);
    }));

    let sumOfProducts = this.sum(v1.map((v, i) => {
        return v * v2[i];
    }));

    let num = sumOfProducts - (sum1 * sum2 / size);
    let den = Math.sqrt((sumOfSquares1 - Math.pow(sum1, 2) / size) * (sumOfSquares2 - Math.pow(sum2, 2) / size));

    if (den === 0) {
        return 0;
    }

    return 1 - num / den;
  },
  hierarchicalCluster(wordMatrix, distanceFn) {
    let distances = {};
    let currentClustId = -1;

    const allWords = this.computeAllWords(wordMatrix);

    let clusters = Object.keys(wordMatrix).map((key, i) => {
       return {
          vec: this.transformVectors(allWords, wordMatrix[key]),
          id: i,
          left: null,
          right: null,
          distance: 0
       };
    });

    while (clusters.length > 1) {
        let lowestPair = [0, 1];
        let closest = distanceFn(clusters[0].vec, clusters[1].vec);

        // look through every pair for smallest distance between vectors
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                let cacheKey = clusters[i].id + "-" + clusters[j].id;
                if (distances[cacheKey] === undefined) {
                    distances[cacheKey] = distanceFn(clusters[0].vec, clusters[1].vec);
                }

                let d = distances[cacheKey];

                if (d < closest) {
                    closest = d;
                    lowestPair = [i, j];
                }
            }
        }

        let avgVec = clusters[lowestPair[0]].vec.map((v1, i) => {
            let v2 = clusters[lowestPair[1]].vec[i];
            return (v1 + v2) / 2;
        });

        let newCluster = {
            vec: avgVec,
            left: clusters[lowestPair[0]],
            right: clusters[lowestPair[1]],
            distance: closest,
            id: currentClustId
        };

        currentClustId -= 1;
        clusters.splice(lowestPair[1], 1);
        clusters.splice(lowestPair[0], 1);

        clusters.push(newCluster);
    }

    return clusters[0];
  },
  generateClusterOutput(cluster, labels, n) {
    let str = "";
    str += "<div>";
    for (let i = 0; i < n; i++) {
      str += "&nbsp;";
    }
    if (cluster.id < 0) {
      str += "";
    } else {
      str += labels[cluster.id] || cluster.id;
    }

    str += "</div>";

    if (cluster.left) {
      str += this.generateClusterOutput(cluster.left, labels, n + 1);
    }

    if (cluster.right) {
      str += this.generateClusterOutput(cluster.right, labels, n + 1);
    }
    return str;
  },
  doHierarchicalCluster(rows) {
    const historyMatrix = this.collectWordMatrix(rows);
    const rootCluster = this.hierarchicalCluster(historyMatrix, this.pearson);
    return this.generateClusterOutput(rootCluster, Object.keys(historyMatrix), 0);
  },
  render() {
    const props = this.props;
    return (<section className="content">
        <button onClick={() => {
          this.setState({output: this.doHierarchicalCluster(props.History.rows)});
        }}>
          Clustering History
        </button>
        <button onClick={() => {
          this.setState({output: this.doHierarchicalCluster(props.Bookmarks.rows)});
        }}>
          Clustering Bookmarks
        </button>
        <div dangerouslySetInnerHTML={{__html: this.state.output}} />
      </section>);
  }
});

TimelineCluster.propTypes = {
  History: React.PropTypes.object.isRequired,
  Bookmarks: React.PropTypes.object.isRequired
};
module.exports = connect(selectHistoryBookmarks)(TimelineCluster);
module.exports.TimelineCluster = TimelineCluster;
