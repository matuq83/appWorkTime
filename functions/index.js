const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

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

      const admins = ["mathiasq.mq@gmail.com", "shaiel.quintana2504@gmail.com","ibanezvalery@hotmail.com"];
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
exports.verificarSuscripcion = functions.https.onCall(async (data, context) => {
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

// 🌐 Webhook de Mercado Pago para activar suscripción automáticamente
exports.mercadoPagoWebhook = functions.https.onRequest(async (req, res) => {
  const { type, data } = req.body;

  if (type === "payment") {
    const paymentId = data.id;
    const token = functions.config().mercadopago.token;

    try {
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const pago = response.data;
      const email = pago.payer.email;
      const estado = pago.status;

      if (estado === "approved") {
        const snapshot = await db.collection("users").where("email", "==", email).get();
        if (!snapshot.empty) {
          const docRef = snapshot.docs[0].ref;
          await docRef.update({
            "suscripcion.activa": true,
            "suscripcion.ultimaFechaPago": new Date().toISOString(),
          });
          console.log(`✅ Suscripción activada para ${email}`);
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("❌ Error en webhook:", error.message);
      res.status(500).send("Error");
    }
  } else {
    res.status(200).send("Evento no procesado");
  }
});
