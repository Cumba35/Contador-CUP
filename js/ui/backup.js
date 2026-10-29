// js/ui/backup.js

export async function handleBackupAction(action, context) {
    const {
        downloadBackup,
        getBackupPreview,
        readBackupFile,
        restoreBackup,
        getBackupFile,
        confirmAction,
        showPreview,
        notify,
        reloadApplication
    } = context;

    switch (action) {
        case "export-backup":
            downloadBackup();
            notify("Copia de seguridad descargada.", "success");
            return true;

        case "show-backup-preview":
            showPreview(JSON.stringify(getBackupPreview(), null, 2));
            return true;

        case "import-backup": {
            const file = getBackupFile();

            if (!file) {
                throw new Error("Selecciona un archivo de respaldo.");
            }

            const inspected = await readBackupFile(file);

            const approved = confirmAction(
                `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres reemplazar los datos existentes?`
            );

            if (!approved) {
                return false;
            }

            restoreBackup(inspected.backup, { overwrite: true });

            notify(
                "Respaldo restaurado. La aplicación se recargará.",
                "success"
            );

            reloadApplication();
            return true;
        }

        default:
            return false;
    }
}