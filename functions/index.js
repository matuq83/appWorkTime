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
  console.log("🔔 Webhook recibido:", JSON.stringify(req.body, null, 2));
  
  const { type, data } = req.body;

  if (type === "payment") {
    const paymentId = data.id;
    const token = functions.config().mercadopago.token;

    try {
      console.log(`🔍 Consultando pago ID: ${paymentId}`);
      
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const pago = response.data;
      console.log("💰 Datos del pago:", JSON.stringify(pago, null, 2));
      
      const email = pago.payer.email.toLowerCase().trim();
      const estado = pago.status;

      console.log(`📧 Email: ${email}, Estado: ${estado}`);

      if (estado === "approved") {
        const snapshot = await db.collection("users")
          .where("email", "==", email)
          .get();

        if (!snapshot.empty) {
          const docRef = snapshot.docs[0].ref;
          const userData = snapshot.docs[0].data();
          const userId = snapshot.docs[0].id;
          
          console.log(`👤 Usuario encontrado: ${email} (UID: ${userId})`);
          console.log(`📋 Datos actuales:`, userData);
          
          // AQUÍ ESTÁ EL ARREGLO: Usar set con merge para crear el campo si no existe
          await docRef.set({
            suscripcion: {
              activa: true,
              ultimaFechaPago: new Date().toISOString(),
              pagoId: paymentId,
              fechaActivacion: new Date().toISOString()
            }
          }, { merge: true }); // merge: true es clave - no sobrescribe, solo agrega/actualiza
          
          console.log(`✅ Suscripción activada para ${email}`);
          
        } else {
          console.log(`❌ Usuario no encontrado para email: ${email}`);
        }
      } else {
        console.log(`⏸️ Pago no aprobado. Estado: ${estado}`);
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("❌ Error en webhook:", error.message);
      res.status(500).send("Error");
    }
  } else {
    console.log(`ℹ️ Evento no procesado: ${type}`);
    res.status(200).send("Evento no procesado");
  }
});
