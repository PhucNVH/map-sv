const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'ejs');
var serviceAccount = require('./config/ttcnpm-map-firebase-adminsdk.json');
var firebase_uid = require('./config/firebase_uid.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://ttcnpm-map.firebaseio.com',
});

var db = admin.database();
var fs = admin.firestore();

var userShip = fs.collection('ship').doc(firebase_uid.uid);

// connect options
const options = {
  connectTimeout: 4000,
  username: 'BKvm',
  password: 'Hcmut_CSE_2020',
  keepalive: 60,
  clean: true,
};

const TCP_URL = 'tcp://52.187.125.59:1883';

const client = mqtt.connect(TCP_URL, options);

client.on('connect', () => {
  console.log('Connect success');
  client.subscribe('Topic/GPS', (err) => {
    if (!err) {
      console.log('Subscribe GPS Success');
    }
  });
});

client.on('reconnect', (error) => {
  console.log('reconnecting:', error);
});

client.on('error', (error) => {
  console.log('Connect Error:', error);
});

app.get('/firestore', (req, res) => {
  c = new Date('2020-06-13');
  d = new Date('2020-06-13 20:00');
  fs.collection('location')
    .where('time', '>=', c)
    .where('time', '<', d)
    .get()
    .then((snapshot) => {
      let val = snapshot.docs.map((e) => e.data());
      val = val.map((e) => ({
        location: {
          latitude: e.location.latitude,
          longitude: e.location.longitude,
        },
        time: e.time.toDate(),
      }));
      res.json(val);
    });
});

client.on('message', (topic, message) => {
  const currentDate = new Date();
  let jsonMessage = JSON.parse(message.toString('utf8'));
  const position = {
    location: new admin.firestore.GeoPoint(
      jsonMessage[0].values[1],
      jsonMessage[0].values[0],
    ),
    time: new Date(),
  };
  userShip.collection('location').add(position);
  userShip.update(position);
  return;
  if (topic === 'Topic/GPS') {
    if (!Array.isArray(jsonMessage)) {
      jsonMessage = [jsonMessage];
    }
    for (gps of jsonMessage) {
      const long = Number.parseFloat(gps.values[0]);
      const lat = Number.parseFloat(gps.values[1]);
      const historyRef = gpsRef.child('history/');
      gpsRef.update({
        latest: {
          time: currentDate.getTime(),
          location: {lat, long},
        },
      });
      historyRef.push().set({
        time: currentDate.getTime(),
        location: {lat, long},
      });
    }
  }
});

app.get('/gps', (req, res) => {
  gpsRef.child('history').once('value', function (data) {
    res.json(data);
  });
});
app.get('/latestPosition', (req, res) => {
  gpsRef.child('latest').once('value', function (data) {
    res.json(data);
  });
});

app.get('/light', (req, res) => {
  lightRef.once('value', function (data) {
    res.json(data);
  });
});

app.get('/latestValue', (req, res) => {
  lightRef.child('latest').once('value', function (data) {
    res.json(data);
  });
});

app.get('/controlLight', (req, res) => {
  res.render('controlLight.ejs');
});
app.post('/controlLight', (req, res) => {
  const device_id = req.body.device_id;
  let state = req.body.selfdestruct || req.body.state;
  state = state === 'on' ? 1 : 0;
  const brightness = req.body.brightness;
  console.log(req.body);
  const data = [{device_id, values: [state, brightness]}];
  console.log('Receive request');
  console.log(data);
  const payload = JSON.stringify(data);
  if (!client.connected) {
    console.log('Can not connect to IOT server');
    res.json({error: 'serverError'});
    return;
  }

  client.publish('Topic/LightD', payload, (error) => {
    console.log(error || 'Publish Success');
    if (!error) {
      userShip.update({
        state,
        brightness,
      });
    }
    res.json(data);
  });
});
app.post('/testPost', (req, res) => {
  res.json({a: 'ok'});
});

app.post('/testGPS', (req, res) => {
  const lat = Number.parseFloat(req.body.lat);
  const long = Number.parseFloat(req.body.long);

  const currentDate = new Date();
  gpsRef.child('history').push().set({
    location: {
      lat,
      long,
    },
    time: currentDate.getTime(),
  });
  gpsRef.child('latest').set(
    {
      location: {
        lat,
        long,
      },
      time: currentDate.getTime(),
    },
    (e) => {
      res.json({
        location: {
          lat,
          long,
        },
        time: currentDate.getTime(),
      });
    },
  );
});

app.post('/testLight', (req, res) => {
  const device_id = req.body.device_id;
  const state = req.body.state;
  const brightness = req.body.brightness;
  const deviceRef = lightRef.child(device_id);
  const historyRef = deviceRef.child('history/');
  const currentDate = new Date();
  historyRef.push().set({
    state,
    brightness,
    time: currentDate.getTime(),
  });
  deviceRef.child('latest').set({
    state,
    brightness,
    time: currentDate.getTime(),
  });
});

const points = require('./path');
const {auth, firestore, database} = require('firebase-admin');
// console.log(points);
app.get('/seedPoint', async (req, res) => {
  for (const e of points) {
    const time = new Date(e.time);
    console.log('heloo');
    await userShip.collection('location').add({
      time,
      location: new admin.firestore.GeoPoint(e.location.lat, e.location.long),
    });
  }
  res.json({ds: 'dsds'});
});

app.get('/area', (req, res) => {
  res.render('area.ejs');
});

app.post('/area', async (req, res) => {
  await fs.collection('area').add({
    type: req.body.type,
    latitude: parseFloat(req.body.lat),
    longitude: parseFloat(req.body.long),
    weight: parseInt(req.body.weight),
  });
  res.json({message: 'OK'});
});

app.get('/deletePoint', async (req, res) => {
  gpsRef.child('history').once('value', (snapshot) => {
    const res = snapshot.val();
    console.log(res);
  });
});

app.get('/signup', (req, res) => {
  res.render('signup.ejs');
});

app.post('/signup', (req, res) => {
  admin
    .auth()
    .createUser({
      email: req.body.email,
      emailVerified: false,
      password: req.body.password,
      displayName: req.body.name,
      photoURL: `https://api.adorable.io/avatars/128/${req.body.email}.png`,
      disabled: false,
    })
    .then(function (userRecord) {
      // See the UserRecord reference doc for the contents of userRecord.
      console.log('Successfully created new user:', userRecord.uid);
      firestore()
        .collection('ship')
        .doc(userRecord.uid)
        .create({
          email: userRecord.email,
          displayName: userRecord.displayName,
          avatar: userRecord.photoURL,
          location: new firestore.GeoPoint(08, 108),
          time: new Date(),
        })
        .then((e) => {
          console.log(e);
          res.json(userRecord.toJSON());
        });
    })
    .catch(function (error) {
      console.log('Error creating new user:', error);
    });
});

var users = require('./MOCK_DATA.json');
app.get('/seedUser', (req, res) => {
  for (const user of users) {
    admin
      .auth()
      .createUser({
        email: user.email,
        emailVerified: false,
        password: '123456',
        displayName: user.name,
        photoURL: `https://api.adorable.io/avatars/128/${user.email}.png`,
        disabled: false,
      })
      .then(function (userRecord) {
        // See the UserRecord reference doc for the contents of userRecord.
        console.log('Successfully created new user:', userRecord.uid);
        firestore()
          .collection('ship')
          .doc(userRecord.uid)
          .create({
            email: userRecord.email,
            displayName: userRecord.displayName,
            avatar: userRecord.photoURL,
            location: new firestore.GeoPoint(
              user.location.latitude,
              user.location.longitude,
            ),
            time: new Date(parseInt(user.time)),
          })
          .then((e) => {
            console.log(e);
          });
      })
      .catch(function (error) {
        console.log('Error creating new user:', error);
      });
  }
});
app.get('/seedFriends', (req, res) => {
  admin
    .auth()
    .listUsers(1000)
    .then(function (listUsersResult) {
      const listuser = listUsersResult.users.map((e) => e.uid);
      for (const user of listuser.slice(0, 10)) {
        firestore()
          .collection('ship/SC0DSlJ1BwW5GJPCmHO5M3HSczv2/friends')
          .add({
            ref: firestore().collection('ship').doc(user),
          })
          .then(console.log)
          .catch(console.log);
      }
    })
    .catch(function (error) {
      console.log('Error listing users:', error);
    });
});

app.get('/seedEnemy', (req, res) => {
  admin
    .auth()
    .listUsers(1000)
    .then(function (listUsersResult) {
      const listuser = listUsersResult.users.map((e) => e.uid);
      for (const user of listuser.slice(50, 60)) {
        firestore()
          .collection('ship/SC0DSlJ1BwW5GJPCmHO5M3HSczv2/enemies')
          .add({
            ref: firestore().collection('ship').doc(user),
          })
          .then(console.log)
          .catch(console.log);
      }
    })
    .catch(function (error) {
      console.log('Error listing users:', error);
    });
});
app.get('/update', (req, res) => {
  auth()
    .getUserByEmail('nvhp46@gmail.com')
    .then((e) => {
      console.log(e);
    });
  // user
  //   .updateProfile({
  //     displayName: 'Jane Q. User',
  //     photoURL: 'https://example.com/jane-q-user/profile.jpg',
  //   })
  //   .then(function () {
  //     // Update successful.
  //   })
  //   .catch(function (error) {
  //     // An error happened.
  //   });
});
var port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server On'));
