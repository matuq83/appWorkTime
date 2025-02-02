// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
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

// SheetJS para exportar a Excel
import * as XLSX from 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const firebaseConfig = {
    apiKey: "AIzaSyAHo3oIecxPdMFJzUm9DJYPn-VS9cSNx9k",
    authDomain: "work-time-app-mq.firebaseapp.com",
    projectId: "work-time-app-mq",
    storageBucket: "work-time-app-mq.firebasestorage.app",
    messagingSenderId: "627385644653",
    appId: "1:627385644653:web:bc22287f25b39fabf93164"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

$(function () {
    // DOM Elements
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

    // Firebase Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loginPage.addClass("d-none");
            workRecords.removeClass("d-none");
            welcomeText.removeClass("d-none");
            logoutButton.removeClass("d-none");
            backToTopButton.show();
    
            try {
                // Obtener los datos del usuario desde Firestore
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    usernameSpan.text(userData.firstName || "Usuario");
                } else {
                    console.log("No se encontraron datos para este usuario.");
                    usernameSpan.text("Usuario");
                }

                // Cargar los registros de trabajo del usuario desde Firestore
                await loadUserData(user.uid);

            } catch (error) {
                console.error("Error al obtener datos del usuario:", error);
                usernameSpan.text("Usuario");
            }
        } else {
            workRecords.addClass("d-none");
            loginPage.removeClass("d-none");
            welcomeText.addClass("d-none");
            logoutButton.addClass("d-none");
        }
    });
    

    // Load User Data from Firebase
    async function loadUserData(userId) {
        try {
            const workRecordsRef = collection(db, `users/${userId}/workRecords`);
            const q = query(workRecordsRef, orderBy('date'));  // Ordenar por fecha
            const querySnapshot = await getDocs(q);

            workData = [];  // Limpiar los datos antes de cargar los nuevos
            querySnapshot.forEach((doc) => {
                workData.push({ ...doc.data(), id: doc.id });
            });

            console.log("Datos cargados:", workData);  // Verificar si los datos se cargan correctamente
            updateWorkTable();  // Actualizar la tabla después de cargar los datos
        } catch (error) {
            console.error("Error loading data:", error);
            alert("Error al cargar los datos: " + error.message);
        }
    }

    // Show Register Page
    $("#register-btn").on("click", function () {
        loginPage.addClass("d-none");
        registerPage.removeClass("d-none");
    });

    // Handle Login
    $("#login-form").on("submit", async function (e) {
        e.preventDefault();
        const email = $("#login-email").val();
        const password = $("#login-password").val();

        try {
            await signInWithEmailAndPassword(auth, email, password);
            $("#login-form")[0].reset();
        } catch (error) {
            alert("Error de inicio de sesión: " + error.message);
        }
    });

    // Handle Registration
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
            
            // Save additional user information
            await setDoc(doc(db, "users", user.uid), {
                firstName,
                lastName,
                sector,
                email
            });

            alert("Usuario registrado con éxito.");
            registerPage.addClass("d-none");
            loginPage.removeClass("d-none");
            $("#register-form")[0].reset();
        } catch (error) {
            alert("Error de registro: " + error.message);
        }
    });

    // Handle Logout
    $("#logout").on("click", async function () {
        try {
            await signOut(auth);
            workData = [];
            updateWorkTable();  // Limpiar la tabla al cerrar sesión
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("Error al cerrar sesión: " + error.message);
        }
    });
    

    // Add Work Record
    $("#work-form").on("submit", async function (e) {
        e.preventDefault();
        const date = $("#work-date").val();
        const startTime = $("#start-time").val();
        const endTime = $("#end-time").val();

        if (startTime >= endTime) {
            alert("La hora de ingreso debe ser menor a la hora de egreso.");
            return;
        }

        // Prevent duplicate entries
        if (workData.some(item => item.date === date && item.startTime === startTime && item.endTime === endTime && editingIndex === -1)) {
            alert("Ya existe una jornada con estas horas.");
            return;
        }

        const hoursWorked = calculateHours(startTime, endTime);
        const record = { date, startTime, endTime, hoursWorked };

        const user = auth.currentUser;
        if (!user) return;

        try {
            if (editingIndex >= 0) {
                // Update existing record
                await updateDoc(doc(db, `users/${user.uid}/workRecords/${workData[editingIndex].id}`), record);
                editingIndex = -1;
            } else {
                // Add new record
                await addDoc(collection(db, `users/${user.uid}/workRecords`), record);
            }

            await loadUserData(user.uid);  // Recargar los datos después de agregar/actualizar un registro
            $("#work-form")[0].reset();  // Limpiar el formulario
        } catch (error) {
            console.error("Error saving record:", error);
            alert("Error al guardar el registro: " + error.message);
        }
    });

    // Edit Work Record
    $(document).on("click", ".edit-button", function () {
        const recordId = $(this).data('id');
        editingIndex = workData.findIndex(item => item.id === recordId);
        const record = workData[editingIndex];
        
        $("#work-date").val(record.date);
        $("#start-time").val(record.startTime);
        $("#end-time").val(record.endTime);
    });

    // Delete Work Record
    $(document).on("click", ".delete-button", async function () {
        const user = auth.currentUser;
        if (!user) return;

        const recordId = $(this).data('id');
        
        try {
            await deleteDoc(doc(db, `users/${user.uid}/workRecords/${recordId}`));
            await loadUserData(user.uid);  // Recargar los datos después de eliminar el registro
        } catch (error) {
            console.error("Error deleting record:", error);
            alert("Error al eliminar el registro: " + error.message);
        }
    });

    // Update Work Table
    function updateWorkTable() {
        const tbody = $("#work-table").empty();  // Limpiar la tabla antes de llenarla
        let totalHours = 0;

        workData.forEach((item) => {
            totalHours += parseFloat(item.hoursWorked);
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

        $("#total-jornadas").text(workData.length);  // Mostrar el número de registros
        $("#total-horas").text(totalHours.toFixed(2));  // Mostrar las horas totales
    }

    // Calculate Hours
    function calculateHours(startTime, endTime) {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        
        let diff = (endHours + endMinutes/60) - (startHours + startMinutes/60);
        return diff.toFixed(2);
    }

    // Clear Work Records (Delete all)
    $("#clear-list").on("click", async function () {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const workRecordsRef = collection(db, `users/${user.uid}/workRecords`);
            const querySnapshot = await getDocs(workRecordsRef);

            querySnapshot.forEach((doc) => {
                deleteDoc(doc.ref);
            });

            await loadUserData(user.uid);  // Recargar los datos después de limpiar
        } catch (error) {
            console.error("Error clearing records:", error);
            alert("Error al limpiar los registros: " + error.message);
        }
    });

    // Export to Excel
    $("#export-excel").on("click", function () {
        const ws = XLSX.utils.table_to_sheet(document.querySelector("table"));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Jornadas");
        XLSX.writeFile(wb, "jornadas_trabajadas.xlsx");
    });
    
    // Theme Toggle
    toggleThemeButton.on("click", function () {
        $("body").toggleClass("dark-mode");
        const themeText = $("body").hasClass("dark-mode") ? "Modo Noche" : "Modo Día";
        toggleThemeButton.find(".theme-text").text(themeText);
    });

    backToTopButton.on("click", function () {
        $("html, body").animate({ scrollTop: 0 }, 500);
    });

    
});
