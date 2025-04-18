// Modular v2 API compatible con Firebase Functions 6.x
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 🔁 Tarea programada para controlar morosidad
exports.controlarMorosidad = onSchedule(
  {
    schedule: "0 3 * * *", // Todos los días a las 3:00 AM
    timeZone: "America/Argentina/Buenos_Aires",
  },
  async () => {
    const usuariosRef = db.collection("users");
    const snapshot = await usuariosRef.get();
    const ahora = new Date();

    for (const docSnap of snapshot.docs) {
      const userData = docSnap.data();
      const userId = docSnap.id;

      const admins = ["mathiasq.mq@gmail.com", "shaiel.quintana2504@gmail.com"];
if (admins.includes(userData.email)) continue;

      const suscripcion = userData.suscripcion || {};
      const ultimaFechaPago = suscripcion.ultimaFechaPago
        ? new Date(suscripcion.ultimaFechaPago)
        : null;

      if (!ultimaFechaPago) continue;

      const diferenciaDias = Math.floor(
        (ahora - ultimaFechaPago) / (1000 * 60 * 60 * 24)
      );

      if (diferenciaDias >= 60) {
        console.log(`🗑️ Eliminando usuario ${userData.email}`);
        await admin.auth().deleteUser(userId).catch(() => {});
        await usuariosRef.doc(userId).delete();
      } else if (diferenciaDias >= 30 && suscripcion.activa !== false) {
        console.log(`🚫 Suspendiendo usuario ${userData.email}`);
        await usuariosRef.doc(userId).update({ "suscripcion.activa": false });
      }
    }

    return null;
  }
);

// ☑️ Endpoint callable para verificar suscripción
exports.verificarSuscripcion = onCall(async (data, context) => {
  const email = data.email;

  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Falta el email");
  }

  const usuariosRef = db.collection("users");
  const snapshot = await usuariosRef.where("email", "==", email).get();

  if (snapshot.empty) {
    return { suscripcionActiva: false };
  }

  const userData = snapshot.docs[0].data();
  const suscripcion = userData.suscripcion || {};

  return { suscripcionActiva: !!suscripcion.activa };
});
