document.addEventListener('DOMContentLoaded', function () {
    // Auto-dismiss alert messages after 4 seconds
    var alerts = document.querySelectorAll('.alert');
    alerts.forEach(function (alertEl) {
        setTimeout(function () {
            var bsAlert = bootstrap.Alert.getOrCreateInstance(alertEl);
            bsAlert.close();
        }, 4000);
    });
});
