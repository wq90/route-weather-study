// Settings for the route weather study (README.md, "Before you start").
window.STUDY_CONFIG = {
  studyVersion: "2026-11-01",

  // The Google Apps Script web app that stores the answers (apps-script/README.md), deployed 2 Nov 2026 from
  // multi.vis.w@gmail.com. With ?test=1 in the address (or with this empty) nothing is sent: the end page shows the data.
  scriptUrl: "https://script.google.com/macros/s/AKfycbx8uGaZL_OMwvv1CRCCHzWjwbkAh-B7PulW6Zd6rZfJd3PwHy-neM6RRCitmq4Scublsg/exec",

  // Shown on the consent page
  studyTitle: "Reading weather along a ship's route",
  institution: "King Abdullah University of Science and Technology (KAUST)",
  contactEmail: "multi.vis.w@gmail.com",

  // The smallest window the trials fit in (the map is 720 x 480 px, the key beside it)
  minWidth: 1100,
  minHeight: 720,
};
