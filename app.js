// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.19.3/package/xlsx.mjs";

const firebaseConfig = {
  apiKey: "AIzaSyAHo3oIecxPdMFJzUm9DJYPn-VS9cSNx9k",
  authDomain: "work-time-app-mq.firebaseapp.com",
  projectId: "work-time-app-mq",
  storageBucket: "work-time-app-mq.firebasestorage.app",
  messagingSenderId: "627385644653",
  appId: "1:627385644653:web:bc22287f25b39fabf93164",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

$(function () {
  const loginPage = $("#login-page");
  const registerPage = $("#register-page");
  const workRecords = $("#work-records");
  const backToTopButton = $("#back-to-top");
  const toggleThemeButton = $("#toggle-theme");
  const welcomeText = $(".welcome-text");
  const usernameSpan = $("#username");
  const logoutButton = $("#logout");

  let workData = [];
  let editingIndex = -1;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("🟢 Usuario autenticado:", user);
      console.log("📧 Email del usuario:", user.email);
  
      const verificarSuscripcion = httpsCallable(functions, "verificarSuscripcion");
      const adminEmails = ["mathiasq.mq@gmail.com", "shaiel.quintana2504@gmail.com"];
  
      if (!adminEmails.includes(user.email)) {
        if (!user.email) {
          console.error("❌ No se pudo obtener el email del usuario.");
          Swal.fire({
            icon: "error",
            title: "Error de autenticación",
            text: "No se pudo obtener tu correo electrónico. Intenta cerrar sesión y volver a ingresar.",
          });
          signOut(auth);
          return;
        }
  
        setTimeout(async () => {
          try {
            const result = await verificarSuscripcion({ email: user.email });
            console.log("📩 Resultado verificación:", result.data);
  
            if (!result.data.suscripcionActiva) {
              Swal.fire({
                icon: "warning",
                title: "Suscripción requerida",
                html: `Tu cuenta está inactiva o suspendida.<br>Necesitás una suscripción activa para acceder a la app.`,
                confirmButtonText: "Abonar ahora",
                showCancelButton: true,
                cancelButtonText: "Cerrar sesión",
              }).then((r) => {
                if (r.isConfirmed) {
                  window.location.href =
                    "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=2c93808494d5e4f40194ddd6ed780530";
                } else {
                  signOut(auth);
                }
              });
              return;
            }
          } catch (error) {
            console.error("❌ Error al verificar suscripción:", error);
            Swal.fire({
              icon: "error",
              title: "Problemas de Suscripción",
              text: "Hubo un problema al verificar tu suscripción. Verifica que tu Pago mensual este realizado,o Realiza tu Pago haciendo click en el BOTON PAGAR SUSCRIPCIÓN",
            });
            return;
          }
        }, 500); // Espera 500ms para asegurarse de que el email esté disponible
      }
  
      // Mostrar interfaz principal
      loginPage.addClass("d-none");
      workRecords.removeClass("d-none");
      welcomeText.removeClass("d-none");
      logoutButton.removeClass("d-none");
      backToTopButton.show();
  
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const nombre = userData.firstName || "Usuario";
          usernameSpan.text(nombre);
          window.nombreUsuario = nombre.toLowerCase();
        } else {
          usernameSpan.text("Usuario");
          window.nombreUsuario = "usuario";
        }
        await loadUserData(user.uid);
      } catch (error) {
        console.error("Error al obtener datos del usuario:", error);
        usernameSpan.text("Usuario");
        window.nombreUsuario = "usuario";
      }
    } else {
      // Usuario no autenticado
      workRecords.addClass("d-none");
      loginPage.removeClass("d-none");
      welcomeText.addClass("d-none");
      logoutButton.addClass("d-none");
    }
  });
  
  $("#login-form").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#login-email").val();
    const password = $("#login-password").val();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      $("#login-form")[0].reset();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error al iniciar sesión", text: error.message });
    }
  });

  $("#register-form").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#email").val();
    const password = $("#password").val();
    const firstName = $("#first-name").val();
    const lastName = $("#last-name").val();
    const sector = $("#sector").val();

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await setDoc(doc(db, "users", user.uid), {
        firstName,
        lastName,
        sector,
        email,
        suscripcion: {
          activa: true,
          ultimaFechaPago: new Date().toISOString(),
        },
      });
      Swal.fire({ icon: "success", title: "Registro exitoso", text: "Usuario creado correctamente." });
      registerPage.addClass("d-none");
      loginPage.removeClass("d-none");
      $("#register-form")[0].reset();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error al registrarse", text: error.message });
    }
  });

  $("#logout").on("click", async function () {
    try {
      await signOut(auth);
      workData = [];
      updateWorkTable();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error al cerrar sesión", text: error.message });
    }
  });

  $("#work-form").on("submit", async function (e) {
    e.preventDefault();
    const date = $("#work-date").val();
    const start = $("#start-time").val();
    const end = $("#end-time").val();

    if (start >= end) {
      Swal.fire({ icon: "warning", title: "Horario inválido", text: "La hora de ingreso debe ser anterior a la de egreso." });
      return;
    }

    const user = auth.currentUser;
    if (!user) return;
    const hoursWorked = calculateHours(start, end);
    const record = { date, startTime: start, endTime: end, hoursWorked };

    try {
      if (editingIndex >= 0) {
        await updateDoc(doc(db, `users/${user.uid}/workRecords/${workData[editingIndex].id}`), record);
        editingIndex = -1;
      } else {
        await addDoc(collection(db, `users/${user.uid}/workRecords`), record);
      }
      await loadUserData(user.uid);
      $("#work-form")[0].reset();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error al guardar", text: error.message });
    }
  });

  $(document).on("click", ".delete-button", async function () {
    const id = $(this).data("id");
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/workRecords/${id}`));
      await loadUserData(user.uid);
      Swal.fire({ icon: "success", title: "Registro eliminado", text: "La jornada ha sido eliminada correctamente." });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error al eliminar", text: err.message });
    }
  });

  $("#clear-list").on("click", async function () {
    const user = auth.currentUser;
    if (!user) return;
    const ref = collection(db, `users/${user.uid}/workRecords`);
    const snapshot = await getDocs(ref);
    snapshot.forEach((doc) => deleteDoc(doc.ref));
    await loadUserData(user.uid);
    Swal.fire({ icon: "success", title: "Lista limpiada", text: "Todos los registros fueron eliminados." });
  });

  $("#forgot-password").on("click", async function () {
    const email = $("#login-email").val();
    if (!email) {
      return Swal.fire({
        icon: "info",
        title: "Ingrese su email",
        text: "Por favor escribí tu email en el campo correspondiente para poder enviar el enlace de recuperación.",
      });
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Swal.fire({
        icon: "success",
        title: "Correo enviado",
        text: "Te enviamos un enlace para restablecer tu contraseña.",
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message,
      });
    }
  });

  function calculateHours(start, end) {
    const [sh, sm] = start.split(":"), [eh, em] = end.split(":");
    return (+eh + +em / 60 - (+sh + +sm / 60)).toFixed(2);
  }

  function updateWorkTable() {
    const tbody = $("#work-table").empty();
    let total = 0;
    workData.forEach((item) => {
      total += parseFloat(item.hoursWorked);
      tbody.append(`
        <tr>
          <td>${item.date}</td>
          <td>${item.startTime}</td>
          <td>${item.endTime}</td>
          <td>${item.hoursWorked}</td>
          <td>
            <button class="btn btn-warning edit-button" data-id="${item.id}">Editar</button>
            <button class="btn btn-danger delete-button" data-id="${item.id}">Eliminar</button>
          </td>
        </tr>
      `);
    });
    $("#total-jornadas").text(workData.length);
    $("#total-horas").text(total.toFixed(2));
  }

  async function loadUserData(userId) {
    try {
      const ref = collection(db, `users/${userId}/workRecords`);
      const q = query(ref, orderBy("date"));
      const snapshot = await getDocs(q);
      workData = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      updateWorkTable();
    } catch (err) {
      console.error("Error al cargar datos:", err);
    }
  }

  // Tema oscuro
toggleThemeButton.on("click", function () {
  $("body").toggleClass("dark-mode");
  const txt = $("body").hasClass("dark-mode") ? "Modo Noche" : "Modo Día";
  toggleThemeButton.find(".theme-text").text(txt);

  // Guardar preferencia localmente
  localStorage.setItem("modoOscuro", $("body").hasClass("dark-mode"));
});

// Restaurar modo oscuro al cargar
if (localStorage.getItem("modoOscuro") === "true") {
  $("body").addClass("dark-mode");
  toggleThemeButton.find(".theme-text").text("Modo Noche");
}


  function exportToExcel(data) {
    if (!data || data.length === 0) {
      Swal.fire({
        icon: "info",
        title: "Sin datos",
        text: "No hay datos para exportar.",
      });
      return;
    }
  
    try {
      const excelData = [
        ["Fecha", "Hora de Ingreso", "Hora de Egreso", "Horas Totales"],
      ];
  
      data.forEach((record) => {
        excelData.push([
          record.date,
          record.startTime,
          record.endTime,
          record.hoursWorked,
        ]);
      });
  
      const totalHoras = data
        .reduce((sum, record) => sum + parseFloat(record.hoursWorked), 0)
        .toFixed(2);
  
      excelData.push([]);
      excelData.push(["Total Jornadas:", data.length]);
      excelData.push(["Total Horas:", totalHoras]);
  
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  
      XLSX.utils.book_append_sheet(wb, ws, "Jornadas");
  
      const nombreUsuario = $("#username").text().toLowerCase().replace(/\s+/g, "_");
      const fechaHoy = new Date().toISOString().split("T")[0];
      const nombreArchivo = `jornadas_${nombreUsuario || "usuario"}_${fechaHoy}.xlsx`;
  
      XLSX.writeFile(wb, nombreArchivo);
    } catch (error) {
      console.error("Error al exportar a Excel:", error);
      Swal.fire({
        icon: "error",
        title: "Error al exportar",
        text: "No se pudo generar el archivo Excel.",
      });
    }
  }
  
  $("#export-excel").on("click", function () {
    exportToExcel(workData);
  });


  //Soporte botton
  $(document).on("click", "#btnContacto", function () {
    Swal.fire({
      title: 'Contacto',
      html: `
      <input type="text" id="nombre" class="swal2-input" placeholder="Tu nombre">
      <input type="email" id="email" class="swal2-input" placeholder="Tu correo">
      <input type="text" id="titulo" class="swal2-input" placeholder="Asunto">
      <textarea id="mensaje" class="swal2-textarea" placeholder="Escribí tu mensaje aquí..."></textarea>
    `,
      confirmButtonText: 'Enviar',
      focusConfirm: false,
      preConfirm: () => {
        const nombre = document.getElementById("nombre").value.trim();
        const email = document.getElementById("email").value.trim();
        const titulo = document.getElementById("titulo").value.trim();
        const mensaje = document.getElementById("mensaje").value.trim();
  
        if (!nombre || !email || !titulo || !mensaje) {
          Swal.showValidationMessage("Todos los campos son obligatorios");
          return false;
        }
  
        return emailjs.send("service_ybtpgqe","template_afr43kp", {
          titulo,
          nombre,
          email,
          mensaje,
        })
        
        .then(() => {
          Swal.fire("✅ Enviado", "Tu mensaje fue enviado correctamente.", "success");
        })
        .catch((error) => {
          console.error("Error al enviar:", error);
          Swal.fire("❌ Error", "No se pudo enviar el mensaje. Intentalo más tarde.", "error");
        });
      }
    });
  });
  
});
