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
        case "export-backup": {
            await downloadBackup();

            await notify(
                "Copia de seguridad descargada.",
                "success"
            );

            return true;
        }

        case "show-backup-preview": {
            const preview = await getBackupPreview();

            await showPreview(
                JSON.stringify(preview, null, 2)
            );

            return true;
        }

        case "import-backup": {
            const file = await getBackupFile();

            if (!file) {
                throw new Error(
                    "Selecciona un archivo de respaldo."
                );
            }

            const inspected = await readBackupFile(file);

            if (
                !inspected ||
                !inspected.backup ||
                !inspected.preview
            ) {
                throw new Error(
                    "No se pudo comprobar el archivo de respaldo."
                );
            }

            const approved = await confirmAction(
                `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres reemplazar los datos existentes?`
            );

            if (!approved) {
                return false;
            }

            await restoreBackup(
                inspected.backup,
                { overwrite: true }
            );

            await notify(
                "Respaldo restaurado. La aplicación se recargará.",
                "success"
            );

            await reloadApplication();

            return true;
        }

        default:
            return false;
    }
}