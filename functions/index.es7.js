const functions = require("firebase-functions");
const firebase = require("firebase-admin");

const firebaseApp = firebase.initializeApp(functions.config().firebase);

exports.notifyNews = functions.database.ref("news/").onWrite(async event => {
  let snapshot = event.data;
  let news = snapshot.val();
  let payload = {
    notification: {
      title: "Anunț nou",
      body: news.text,
      click_action: "https://master-ssea.github.io/",
      icon: "https://i.imgur.com/hJT6fBc.png"
    }
  };

  let users = await firebaseApp
    .database()
    .ref("users/")
    .once("value");
  users.forEach(user => {
    let token = user.val().notificationToken;
    // This is a promise. I don't really need to wait for it to fulfill
    firebaseApp.messaging().sendToDevice(token, payload);
  });
});

// Notify each user at the end of the week to leave reviews
exports.endOfWeek = functions.https.onRequest(async (req, res) => {
  console.log("End of week notification!");

  let users = await firebaseApp
    .database()
    .ref("users")
    .once("value");

  users.forEach(user => {
    let userToReview = user.child("toReview").val();
    let noToReview = Object.keys(userToReview)
      .map(key => {
        return userToReview[key];
      })
      .filter(val => val == true).length;

    if (noToReview == 0) return;

    let notificationToken = user.val().notificationToken;

    let payload = {
      notification: {
        title: "Recenzii noi",
        body: `${noToReview} recenzii disponibile.`,
        click_action: "https://master-ssea.github.io/",
        icon: "https://i.imgur.com/hJT6fBc.png"
      }
    };
    if (notificationToken)
      firebaseApp.messaging().sendToDevice(notificationToken, payload);
  });

  res.status(200).send("End of week successful.");
});

exports.refreshToBeReviewed = functions.https.onRequest(async (req, res) => {
  console.log("Filtering review list");
  let subjects = await firebaseApp
    .database()
    .ref("discipline")
    .once("value");

  let users = await firebaseApp
    .database()
    .ref("users")
    .once("value");

  let answers = await firebaseApp
    .database()
    .ref("answers")
    .once("value");

  users.forEach(user => {
    let toReview = user.val().toReview;
    Object.keys(toReview).map(key => {
      let questionAnswer = answers.child(key).val() || [];
      let usersWhoReviewed = Object.keys(questionAnswer);
      let temp = {};
      let startDate = getStartDate(key, subjects);
      if (
        startDate <= new Date().getTime() &&
        new Date().getTime() - startDate < 1000 * 60 * 60 * 24 * 14 &&
        usersWhoReviewed.includes(user.key) == false
      ) {
        temp[key] = true;
      } else {
        temp[key] = false;
      }

      if (toReview[key] != temp[key])
        firebaseApp
          .database()
          .ref("users/" + user.key + "/toReview/")
          .update({
            ...temp
          });
    });
  });

  res.status(200).send("Update successful.");
});

function getStartDate(ID, subjects) {
  let startDate = null;

  subjects.forEach(subject => {
    let cursuri = subject.val().cursuri;
    let seminarii = subject.val().seminarii;
    let laboratoare = subject.val().laboratoare;

    if (Object.keys(cursuri).includes(ID)) {
      startDate = cursuri[ID].dateStart;
      return true;
    }
    if (Object.keys(seminarii).includes(ID)) {
      startDate = seminarii[ID].dateStart;
      return true;
    }
    if (Object.keys(laboratoare).includes(ID)) {
      startDate = laboratoare[ID].dateStart;
      return true;
    }
  });

  return startDate;
}

exports.createAccount = functions.auth.user().onCreate(async event => {
  const user = event.data;

  let snapshot = null;

  snapshot = await firebaseApp
    .database()
    .ref("discipline")
    .once("value");

  let toBeReviewed = {};
  snapshot.forEach(disciplina => {
    let cursuri = disciplina.child("cursuri");
    let seminarii = disciplina.child("seminarii");
    let laboratoare = disciplina.child("laboratoare");

    cursuri.forEach(curs => {
      let id = curs.key;
      if (curs.val().dateStart <= new Date().getTime()) toBeReviewed[id] = true;
      else toBeReviewed[id] = false;
    });

    seminarii.forEach(seminar => {
      let id = seminar.key;
      if (seminar.val().dateStart <= new Date().getTime())
        toBeReviewed[id] = true;
      else toBeReviewed[id] = false;
    });

    laboratoare.forEach(laborator => {
      let id = laborator.key;
      if (laborator.val().dateStart <= new Date().getTime())
        toBeReviewed[id] = true;
      else toBeReviewed[id] = false;
    });
  });

  return firebaseApp
    .database()
    .ref("users/" + user.uid)
    .update({
      email: user.email,
      toReview: toBeReviewed
    });
});
