const network = {
  save: (url, bearer, dataTxt) => {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();

      req.onreadystatechange = () => {
        if (req.readyState === XMLHttpRequest.DONE) {
          if (req.status === 200) {
            resolve();

          } else {
            reject();
          }
        }
      };

      req.open('PUT', url, true);
      if (bearer) {
        req.setRequestHeader('Authorization', bearer);
      }
      req.setRequestHeader('Content-type','application/json');
      req.send(JSON.stringify({ save: dataTxt }));
    });
  },

  load: (url, bearer = '') => {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();

      req.onreadystatechange = () => {
        if (req.readyState === XMLHttpRequest.DONE) {
          if (req.status === 200) {
            resolve(JSON.parse(req.responseText).save || null);

          } else {
            reject();
          }
        }
      };

      req.open('GET', url, true);
      if (bearer) {
        req.setRequestHeader('Authorization', bearer);
      }
      req.send();
    });
  }
};
