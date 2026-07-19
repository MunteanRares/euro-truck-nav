// export default defineNuxtPlugin(() => {
//     if (import.meta.client) {
//         const isDev = process.dev;
//         const isMobileDevice =
//             /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
//                 navigator.userAgent,
//             );

//         if (isDev || isMobileDevice) {
//             const script = document.createElement("script");
//             script.src = "https://cdn.jsdelivr.net/npm/eruda";
//             document.body.appendChild(script);

//             script.onload = () => {
//                 try {
//                     (window as any).eruda.init();

//                     (window as any).eruda.position({ x: 10, y: 10 });

//                     console.log(
//                         "[DEBUG] Eruda mobile devtools loaded successfully.",
//                     );
//                 } catch (err) {
//                     console.error("Failed to initialize Eruda:", err);
//                 }
//             };
//         }
//     }
// });
