document.addEventListener("DOMContentLoaded", () => {
    // Set the earliest allowed end date based on the selected start date.
    const startDate = document.querySelector('input[name="start_date"]');
    const endDate = document.querySelector('input[name="end_date"]');

    if (startDate && endDate) {
        startDate.addEventListener("change", () => {
            endDate.min = startDate.value;

            if (endDate.value && endDate.value < startDate.value) {
                endDate.value = "";
            }
        });
    }

    // Confirm listing deletion.
    document.querySelectorAll(".delete-confirm").forEach(form => {
        form.addEventListener("submit", event => {
            if (!confirm("Are you sure you want to delete this listing?")) {
                event.preventDefault();
            }
        });
    });
});