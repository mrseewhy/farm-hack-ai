import { type Language } from "@/lib/preferences";

/**
 * Fixed UI copy for FarmHack AI.
 *
 * IMPORTANT: the Yoruba, Hausa and Igbo strings below are draft translations.
 * They have NOT been reviewed by native speakers or an agricultural reviewer
 * yet, and the product requirements require that review before a pilot. The
 * previous version of this file incorrectly claimed the strings were reviewed.
 */
const translations: Record<Language, Record<string, string>> = {
  English: {
    appName: "FarmHack AI",
    tagline: "Clear crop guidance for farmers",

    // Auth
    heroEyebrow: "For healthier harvests",
    heroTitle: "Understand your crops, one conversation at a time.",
    heroSubtitle:
      "Describe what you see, share a photo, and get clear guidance in your language.",
    heroFooter: "Built for Nigerian farmers",
    welcomeBack: "Welcome back",
    getStarted: "Get started",
    signIn: "Sign in",
    createAccount: "Create account",
    createFarmerAccount: "Create your farmer account",
    signupSubtitle:
      "Join FarmHack AI to keep track of your crop conversations.",
    loginSubtitle: "Continue to your crop conversations.",
    fullName: "Full name",
    emailAddress: "Email address",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    preferredLanguage: "Preferred language",
    alreadyHaveAccount: "Already have an account?",
    newToFarmhack: "New to FarmHack AI?",
    signInLink: "Sign in",
    createAccountLink: "Create an account",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Enter your password",
    namePlaceholder: "Your name",
    createAccountButton: "Create account",
    signInButton: "Sign in",
    pleaseWait: "Please wait...",
    errorAuthGeneric: "Could not access your account. Please try again.",
    errorConnection: "Could not connect. Check your connection and try again.",
    consentAgree:
      "I agree to the privacy and data-processing notice.",
    consentReadNotice: "Read the notice",

    // Navigation
    newChat: "New chat",
    yourConversations: "Your conversations",
    conversationsWillAppear: "Your conversations will appear here.",
    profileSettings: "Profile & settings",
    signOut: "Sign out",
    newConversationTitle: "New conversation",
    conversationTitle: "Conversation",

    // Chat
    yourCropCompanion: "Your crop companion",
    whatIsHappening: "What is happening with your crops?",
    describeSigns:
      "Describe the signs you see or add a clear photo. We’ll help you understand what to check next.",
    placeholderMessage: "Describe what you see on your crop...",
    messageLabel: "Message",
    attachPhoto: "Attach crop photo",
    sendMessage: "Send message",
    conversationLanguage: "Conversation language",
    analyzing: "Analyzing your crop...",
    cropAssessment: "Crop assessment",
    deleteConversation: "Delete conversation",
    deleteConfirm: "Delete this conversation?",
    retry: "Retry analysis",
    errorAssessmentFailed: "Could not analyze the crop. Please try again.",
    assessmentQueued:
      "The crop service is busy. Your message is saved and will be retried automatically; you can also retry now.",
    errorInvalidImage: "Invalid image type. Use JPEG, PNG, or WebP.",
    errorImageTooLarge: "Image too large. Maximum 10MB.",
    errorMaxImages: "Maximum 5 images per conversation reached.",
    errorLoadConversation: "Failed to load conversation. Please try again.",
    errorDeleteConversation: "Failed to delete conversation.",
    imageNotExamined:
      "One or more photos could not be examined. Please upload a clear photo again.",

    // Assessment fields
    observedSigns: "Observed signs",
    possibleCauses: "Possible causes",
    thingsToCheck: "Things to check",
    suggestedActions: "Suggested actions",
    whenToSeekHelp: "When to seek help",
    uncertainty: "Uncertainty",

    // Follow-up
    feedbackTitle: "Was this advice helpful?",
    feedbackQuestion: "Did this advice help with your crop?",
    observationLabel: "What did you observe after trying the advice?",
    observationPlaceholder: "Describe what you noticed...",
    outcomeHelped: "Helped",
    outcomeNotHelped: "Did not help",
    outcomeUnsure: "Not sure",
    submitFeedback: "Submit feedback",
    submitting: "Submitting…",
    thankYouFeedback: "Thank you for your feedback.",

    // Profile
    profileSettingsTitle: "Profile & settings",
    manageHowYouUse: "Manage how you use FarmHack AI.",
    back: "Back",
    languageTitle: "Language",
    languageChoice: "Choose the language you prefer for crop conversations.",
    languageSaved: "Language updated.",
    languageSaveError: "Could not save language.",
    savedToAccount: "Your choice is saved to your account and used by default in chat.",
    passwordSection: "Password",
    passwordHint: "Use a strong password that you do not use elsewhere.",
    changePasswordButton: "Update password",
    currentPassword: "Current password",
    newPasswordPlaceholder: "New password",
    passwordChanged: "Password updated.",
    passwordChangeError: "Could not change password.",

    // Photo tips
    photoTips: "Photo tips",
    tipWholePlant: "Whole plant — include stems and leaves",
    tipAffectedPart: "Affected part — close-up of the damaged area",
    tipGoodLighting: "Good lighting — natural light, no flash",
    limitationsNotice:
      "This is preliminary AI guidance, not a confirmed diagnosis. Confirm important decisions with a local agricultural extension worker.",

    // Sources (citations attached to an assessment)
    sourcesTitle: "Sources for this guidance",
    sourceBackedLabel: "Source-backed (not expert-reviewed)",
    sourceExpertReviewed: "Expert-reviewed",
    sourceAccessed: "Accessed",

    // Guided symptom intake
    guidedTitle: "Common signs — tap to add",
    guidedHint: "Not sure what to write? Start by choosing what you see.",
    symptomYellowLeaves: "Yellowing leaves",
    symptomDarkSpots: "Dark spots on leaves",
    symptomWilting: "Wilting or drooping",
    symptomHoles: "Holes in leaves",
    symptomInsects: "Insects or whiteflies",
    symptomLeafCurl: "Curled or deformed leaves",
    symptomFruitRot: "Fruit rot or spots",

    // Follow-up reminders
    reminderTitle: "Did the advice help your crop?",
    reminderBody:
      "You asked about a crop problem a few days ago. Sharing what happened helps you get better advice and helps other farmers.",
    reminderAction: "Share an update",
    reminderDismiss: "Not now",

    // Errors
    errorSendFailed: "Could not send your message. Please try again.",
    errorFeedbackFailed: "Could not submit feedback. Please try again.",
  },

  Yoruba: {
    appName: "FarmHack AI",
    tagline: "Ìtọ́sọ́nà ohun ọ̀gbà tí ó ṣe kedere fún àwọn àgbẹ̀",

    // Auth
    heroEyebrow: "Fún ìkórè tí ó ní ìlera",
    heroTitle: "Yé ohun ọ̀gbà rẹ, ní ìjíròrò kan sí ìkejì.",
    heroSubtitle:
      "Ṣàpèjúwe ohun tí o rí, fi fọ́tò ránṣẹ́, kí o sì gba ìtọ́sọ́nà tí ó ṣe kedere ní èdè rẹ.",
    heroFooter: "A ṣe é fún àwọn àgbẹ̀ Nàìjíríà",
    welcomeBack: "Káàbọ̀ padà",
    getStarted: "Bẹ̀rẹ̀",
    signIn: "Wọlé",
    createAccount: "Ṣí àkọsílẹ̀",
    createFarmerAccount: "Ṣí àkọsílẹ̀ àgbẹ̀ rẹ",
    signupSubtitle:
      "Darapọ̀ mọ́ FarmHack AI kí o lè tọ́jú àwọn ìjíròrò ohun ọ̀gbà rẹ.",
    loginSubtitle: "Tẹ̀síwájú sí àwọn ìjíròrò ohun ọ̀gbà rẹ.",
    fullName: "Orúkọ kíkún",
    emailAddress: "Àdírẹ́sì ímeèlì",
    password: "Ọ̀rọ̀ ìpamọ́",
    showPassword: "Fi ọ̀rọ̀ ìpamọ́ hàn",
    hidePassword: "Fi ọ̀rọ̀ ìpamọ́ pamọ́",
    preferredLanguage: "Èdè tí o fẹ́",
    alreadyHaveAccount: "Ṣé o ní àkọsílẹ̀ tẹ́lẹ̀?",
    newToFarmhack: "Ṣé o ṣẹ̀ṣẹ̀ dé FarmHack AI?",
    signInLink: "Wọlé",
    createAccountLink: "Ṣí àkọsílẹ̀",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Tẹ ọ̀rọ̀ ìpamọ́ rẹ",
    namePlaceholder: "Orúkọ rẹ",
    createAccountButton: "Ṣí àkọsílẹ̀",
    signInButton: "Wọlé",
    pleaseWait: "Jọ̀wọ́ dúró...",
    errorAuthGeneric:
      "A kò lè wọlé sí àkọsílẹ̀ rẹ. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.",
    errorConnection:
      "A kò lè sopọ̀. Jọ̀wọ́ yẹ̀wò ìsopọ̀ rẹ kí o sì gbìyànjú lẹ́ẹ̀kan sí i.",
    consentAgree:
      "Mo gbà pẹ̀lú ìkéde àṣírí àti ìlànà lílo dátà.",
    consentReadNotice: "Ka ìkéde náà",

    // Navigation
    newChat: "Ìjíròrò tuntun",
    yourConversations: "Àwọn ìjíròrò rẹ",
    conversationsWillAppear: "Àwọn ìjíròrò rẹ yóò farahàn níbí.",
    profileSettings: "Profáìlì àti ètò",
    signOut: "Jáde",
    newConversationTitle: "Ìjíròrò tuntun",
    conversationTitle: "Ìjíròrò",

    // Chat
    yourCropCompanion: "Alábàákẹ́gbẹ́ ohun ọ̀gbà rẹ",
    whatIsHappening: "Kí ni ń ṣẹlẹ̀ sí ohun ọ̀gbà rẹ?",
    describeSigns:
      "Ṣàpèjúwe àwọn àmì tí o rí tàbí fi fọ́tò tí ó ṣe kedere kún. A máa ràn ọ́ lọ́wọ́ láti mọ ohun tí o yẹ kí o yẹ̀wò.",
    placeholderMessage: "Ṣàpèjúwe ohun tí o rí ní orí ohun ọ̀gbà rẹ...",
    messageLabel: "Ìfiránṣẹ́",
    attachPhoto: "Fi fọ́tò ohun ọ̀gbà kún",
    sendMessage: "Ránṣẹ́",
    conversationLanguage: "Èdè ìjíròrò",
    analyzing: "Ń ṣàyẹ̀wò ohun ọ̀gbà rẹ...",
    cropAssessment: "Àyẹ̀wò ohun ọ̀gbà",
    deleteConversation: "Pa ìjíròrò rẹ́",
    deleteConfirm: "Ṣé kí a pa ìjíròrò yìí rẹ́?",
    retry: "Gbìyànjú àyẹ̀wò lẹ́ẹ̀kan sí i",
    errorAssessmentFailed:
      "A kò lè ṣàyẹ̀wò ohun ọ̀gbà náà. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.",
    assessmentQueued:
      "Iṣẹ́ àyẹ̀wò díbọ́. A ti fi ìfiránṣẹ́ rẹ pamọ́, a ó sì gbìyànjú lẹ́ẹ̀kan sí i; o lè gbìyànjú báyìí pẹ̀lú.",
    errorInvalidImage: "Irú fọ́tò kò tọ́. Lo JPEG, PNG, tàbí WebP.",
    errorImageTooLarge: "Fọ́tò náà tóbi jù. Ìwọ̀n 10MB.",
    errorMaxImages: "Fọ́tò márùn-ún ni ó pọ̀ jù fún ìjíròrò kan.",
    errorLoadConversation:
      "A kò lè gbé ìjíròrò wá. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.",
    errorDeleteConversation: "A kò lè pa ìjíròrò rẹ́.",
    imageNotExamined:
      "A kò lè ṣàyẹ̀wò fọ́tò kan tàbí jù bẹ́ẹ̀ lọ. Jọ̀wọ́ tún fọ́tò tí ó ṣe kedere gbé wọlé.",

    // Assessment fields
    observedSigns: "Àwọn àmì tí a rí",
    possibleCauses: "Àwọn ohun tí ó lè fà á",
    thingsToCheck: "Àwọn ohun tí o yẹ kí o yẹ̀wò",
    suggestedActions: "Àwọn ìgbésẹ̀ tí a dábàá",
    whenToSeekHelp: "Ìgbà tí o yẹ kí o wá ìrànlọ́wọ́",
    uncertainty: "Àìdánilójú",

    // Follow-up
    feedbackTitle: "Ṣé ìmọ̀ràn yìí ràn ọ́ lọ́wọ́?",
    feedbackQuestion: "Ṣé ìmọ̀ràn yìí ràn ọ́ lọ́wọ́ pẹ̀lú ohun ọ̀gbà rẹ?",
    observationLabel: "Kí ni o ṣàkíyèsí lẹ́yìn tí o gbìyànjú ìmọ̀ràn náà?",
    observationPlaceholder: "Ṣàpèjúwe ohun tí o ṣàkíyèsí...",
    outcomeHelped: "Ó ràn án lọ́wọ́",
    outcomeNotHelped: "Kò ràn án lọ́wọ́",
    outcomeUnsure: "Mi ò dánilójú",
    submitFeedback: "Fi èrò rẹ ránṣẹ́",
    submitting: "Ń ránṣẹ́…",
    thankYouFeedback: "Ẹ ṣé fún èrò rẹ.",

    // Profile
    profileSettingsTitle: "Profáìlì àti ètò",
    manageHowYouUse: "Ṣàkóso bí o ṣe ń lo FarmHack AI.",
    back: "Padà",
    languageTitle: "Èdè",
    languageChoice: "Yan èdè tí o fẹ́ fún àwọn ìjíròrò ohun ọ̀gbà.",
    languageSaved: "A ti yí èdè padà.",
    languageSaveError: "A kò lè tọ́jú èdè.",
    savedToAccount:
      "Yíyàn rẹ ni a fi pamọ́ sínú àkọsílẹ̀ rẹ, a sì máa lò ó ní ìjíròrò.",
    passwordSection: "Ọ̀rọ̀ ìpamọ́",
    passwordHint: "Lo ọ̀rọ̀ ìpamọ́ tí ó lágbára tí o kò lò níbòmíràn.",
    changePasswordButton: "Yí ọ̀rọ̀ ìpamọ́ padà",
    currentPassword: "Ọ̀rọ̀ ìpamọ́ tí ó wà báyìí",
    newPasswordPlaceholder: "Ọ̀rọ̀ ìpamọ́ tuntun",
    passwordChanged: "A ti yí ọ̀rọ̀ ìpamọ́ padà.",
    passwordChangeError: "A kò lè yí ọ̀rọ̀ ìpamọ́ padà.",

    // Photo tips
    photoTips: "Àwọn ìmọ̀ràn fọ́tò",
    tipWholePlant: "Gbogbo ọ̀gbà — pẹ̀lú ẹ̀ka àti ewé",
    tipAffectedPart: "Apá tí ó kan — fọ́tò tímọ́tímọ́",
    tipGoodLighting: "Ìmọ́lẹ̀ tó dára — ìmọ́lẹ̀ àdánidá, má lo fíláṣì",
    limitationsNotice:
      "Èyí jẹ́ ìtọ́sọ́nà AI alakọbẹ̀rẹ̀, kì í ṣe ìdánilójú àrùn. Máa gbà àwọn ìpinnu pàtàkì ní ìmọ̀ràn lọ́wọ́ òṣìṣẹ́ ìtẹ̀numọ́síṣẹ́ àgbẹ̀.",

    // Sources
    sourcesTitle: "Àwọn orísun fún ìtọ́sọ́nà yìí",
    sourceBackedLabel: "Láti orísun (a kò ṣàyẹ̀wò pẹ̀lú ògbógi)",
    sourceExpertReviewed: "A ṣàyẹ̀wò pẹ̀lú ògbógi",
    sourceAccessed: "A wọlé sí",

    // Guided symptom intake
    guidedTitle: "Àwọn àmì tí ó wọ́pọ̀ — tẹ̀ láti fi kún",
    guidedHint: "Ṣé o kò mọ ohun tí o yẹ kí o kọ? Bẹ̀rẹ̀ nípa yíyan ohun tí o rí.",
    symptomYellowLeaves: "Ewé tí ó ń yọ́ (ofeefee)",
    symptomDarkSpots: "Àmì dúdú lórí ewé",
    symptomWilting: "Rírọ tàbí dídà",
    symptomHoles: "Iho nínú ewé",
    symptomInsects: "Kòkòrò tàbí eéfín funfun",
    symptomLeafCurl: "Ewé tí ó ká tàbí tí ó yí padà",
    symptomFruitRot: "Ìbàjẹ́ èso tàbí àmì",

    // Follow-up reminders
    reminderTitle: "Ṣé ìmọ̀ràn náà ràn ohun ọ̀gbà rẹ lọ́wọ́?",
    reminderBody:
      "O béèrè nípa ìṣòro ohun ọ̀gbà ní ọjọ́ díẹ̀ sẹ́yìn. Pínpín ohun tí ó ṣẹlẹ̀ yóò ràn ọ́ lọ́wọ́ láti gba ìmọ̀ràn tí ó dára jù, yóò sì ràn àwọn àgbẹ̀ mìíràn lọ́wọ́.",
    reminderAction: "Pín ìmọ̀ tuntun",
    reminderDismiss: "Kì í ṣe báyìí",

    // Errors
    errorSendFailed: "A kò lè rán ìfiránṣẹ́ rẹ. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.",
    errorFeedbackFailed: "A kò lè fi èrò rẹ ránṣẹ́. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.",
  },

  Hausa: {
    appName: "FarmHack AI",
    tagline: "Bayyanannen jagora kan amfanin gona ga manoma",

    // Auth
    heroEyebrow: "Don amfanin gona mai lafiya",
    heroTitle: "Fahimci amfanin gonarka, tattaunawa ɗaya bayan ɗaya.",
    heroSubtitle:
      "Bayyana abin da kake gani, raba hoto, ka sami jagora mai haske a harshenka.",
    heroFooter: "An gina shi don manoman Najeriya",
    welcomeBack: "Barka da dawowa",
    getStarted: "Fara",
    signIn: "Shiga",
    createAccount: "Ƙirƙira asusu",
    createFarmerAccount: "Ƙirƙira asusun manomi",
    signupSubtitle:
      "Shiga FarmHack AI don adana tattaunawar amfanin gonarka.",
    loginSubtitle: "Ci gaba da tattaunawar amfanin gonarka.",
    fullName: "Cikakken suna",
    emailAddress: "Adireshin imel",
    password: "Kalmar sirri",
    showPassword: "Nuna kalmar sirri",
    hidePassword: "Ɓoye kalmar sirri",
    preferredLanguage: "Harshen da ka fi so",
    alreadyHaveAccount: "Kana da asusu riga?",
    newToFarmhack: "Sabon zuwa ne ga FarmHack AI?",
    signInLink: "Shiga",
    createAccountLink: "Ƙirƙira asusu",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Shigar da kalmar sirrinka",
    namePlaceholder: "Sunanka",
    createAccountButton: "Ƙirƙira asusu",
    signInButton: "Shiga",
    pleaseWait: "Don Allah jira...",
    errorAuthGeneric: "Ba a iya shiga asusunka ba. Don Allah sake gwadawa.",
    errorConnection:
      "Ba a iya haɗawa ba. Duba haɗin yanar gizonka ka sake gwadawa.",
    consentAgree:
      "Na yarda da sanarwar sirri da sarrafa bayanai.",
    consentReadNotice: "Karanta sanarwar",

    // Navigation
    newChat: "Sabuwar tattaunawa",
    yourConversations: "Tattaunawarka",
    conversationsWillAppear: "Tattaunawarka za su bayyana a nan.",
    profileSettings: "Bayanan martaba da saituna",
    signOut: "Fita",
    newConversationTitle: "Sabuwar tattaunawa",
    conversationTitle: "Tattaunawa",

    // Chat
    yourCropCompanion: "Abokin tafiyar amfanin gonarka",
    whatIsHappening: "Me ke faruwa da amfanin gonarka?",
    describeSigns:
      "Bayyana alamun da kake gani ko ka ƙara hoto mai haske. Za mu taimaka maka ka san abin da za ka duba.",
    placeholderMessage: "Bayyana abin da kake gani a amfanin gonarka...",
    messageLabel: "Saƙo",
    attachPhoto: "Ƙara hoton amfanin gona",
    sendMessage: "Aika",
    conversationLanguage: "Harshen tattaunawa",
    analyzing: "Ana nazarin amfanin gonarka...",
    cropAssessment: "Kimanta amfanin gona",
    deleteConversation: "Share tattaunawa",
    deleteConfirm: "Share wannan tattaunawa?",
    retry: "Sake gwada nazari",
    errorAssessmentFailed:
      "Ba a iya nazarin amfanin gonar ba. Don Allah sake gwadawa.",
    assessmentQueued:
      "Aikin nazari yana aiki. An ajiye saƙonka kuma za a sake gwadawa kai tsaye; za ka iya sake gwadawa yanzu.",
    errorInvalidImage: "Nau'in hoto bai dace ba. Yi amfani da JPEG, PNG, ko WebP.",
    errorImageTooLarge: "Hoton ya yi girma. Iyaka 10MB.",
    errorMaxImages: "An kai iyakar hotuna 5 a kowace tattaunawa.",
    errorLoadConversation: "An kasa loda tattaunawa. Sake gwadawa.",
    errorDeleteConversation: "An kasa share tattaunawa.",
    imageNotExamined:
      "Ba a iya nazarin hoto ɗaya ko fiye ba. Don Allah sake loda hoto mai haske.",

    // Assessment fields
    observedSigns: "Alamun da aka gani",
    possibleCauses: "Dalilai masu yiwuwa",
    thingsToCheck: "Abubuwan da za a duba",
    suggestedActions: "Matakan da aka ba da shawara",
    whenToSeekHelp: "Lokacin neman taimako",
    uncertainty: "Rashin tabbas",

    // Follow-up
    feedbackTitle: "Shin wannan shawara ta taimaka?",
    feedbackQuestion: "Shin wannan shawara ta taimaka wa amfanin gonarka?",
    observationLabel: "Me ka lura da shi bayan ka gwada shawarar?",
    observationPlaceholder: "Bayyana abin da ka lura da shi...",
    outcomeHelped: "Ya taimaka",
    outcomeNotHelped: "Bai taimaka ba",
    outcomeUnsure: "Ba ni da tabbas",
    submitFeedback: "Aika ra'ayi",
    submitting: "Ana aikawa…",
    thankYouFeedback: "Na gode da ra'ayinka.",

    // Profile
    profileSettingsTitle: "Bayanan martaba da saituna",
    manageHowYouUse: "Sarrafa yadda kake amfani da FarmHack AI.",
    back: "Koma",
    languageTitle: "Harshe",
    languageChoice: "Zaɓi harshen da ka fi so don tattaunawar amfanin gona.",
    languageSaved: "An sabunta harshe.",
    languageSaveError: "Ba a iya adana harshe ba.",
    savedToAccount:
      "Zaɓinka ana adana shi a asusunka kuma ana amfani da shi a tattaunawa.",
    passwordSection: "Kalmar sirri",
    passwordHint:
      "Yi amfani da kalmar sirri mai ƙarfi da ba ka amfani da ita wani wuri.",
    changePasswordButton: "Canza kalmar sirri",
    currentPassword: "Kalmar sirri ta yanzu",
    newPasswordPlaceholder: "Sabuwar kalmar sirri",
    passwordChanged: "An canza kalmar sirri.",
    passwordChangeError: "Ba a iya canza kalmar sirri ba.",

    // Photo tips
    photoTips: "Shawarwarin hoto",
    tipWholePlant: "Dukan shuka — har da rassa da ganye",
    tipAffectedPart: "Sashin da ya shafa — hoto na kusa",
    tipGoodLighting: "Haske mai kyau — hasken rana, ba walƙiya",
    limitationsNotice:
      "Wannan jagora ce ta farko ta AI, ba tabbatacciyar ganewar asali ba. Tabbatar da muhimman shawarwari da ma'aikacin aikin gona na gida.",

    // Sources
    sourcesTitle: "Tushen wannan jagora",
    sourceBackedLabel: "Daga tushe (ba ƙwararren masani ya duba ba)",
    sourceExpertReviewed: "Ƙwararren masani ya duba",
    sourceAccessed: "An shiga",

    // Guided symptom intake
    guidedTitle: "Alamun da suka zama ruwan dare — matsa don ƙarawa",
    guidedHint: "Ba ka san abin da za ka rubuta ba? Fara da zaɓar abin da kake gani.",
    symptomYellowLeaves: "Ganye masu ruwan rawaya",
    symptomDarkSpots: "Duhun tabo a kan ganye",
    symptomWilting: "Yin shuɗi ko faɗuwa",
    symptomHoles: "Ramuka a cikin ganye",
    symptomInsects: "Kwari ko fararen ƙuda",
    symptomLeafCurl: "Ganye da suka naɗe ko suka lalace",
    symptomFruitRot: "Rubewar 'ya'ya ko tabo",

    // Follow-up reminders
    reminderTitle: "Shin shawarar ta taimaki amfanin gonarka?",
    reminderBody:
      "Ka yi tambaya kan matsalar amfanin gona 'yan kwanaki da suka wuce. Raba abin da ya faru zai taimaka maka samun shawara mafi kyau kuma zai taimaki sauran manoma.",
    reminderAction: "Raba sabuntawa",
    reminderDismiss: "Ba yanzu ba",

    // Errors
    errorSendFailed: "Ba a iya aika saƙonka ba. Don Allah sake gwadawa.",
    errorFeedbackFailed: "Ba a iya aika ra'ayinka ba. Don Allah sake gwadawa.",
  },

  Igbo: {
    appName: "FarmHack AI",
    tagline: "Ntuziaka ihe ubi doro anya maka ndị ọrụ ubi",

    // Auth
    heroEyebrow: "Maka ihe ubi dị mma",
    heroTitle: "Ghọta ihe ubi gị, otu mkparịta ụka n'otu oge.",
    heroSubtitle:
      "Kọwaa ihe ị na-ahụ, kesaa foto, nweta ntuziaka doro anya n'asụsụ gị.",
    heroFooter: "E mere ya maka ndị ọrụ ubi Naịjịrịa",
    welcomeBack: "Nnọọ ọzọ",
    getStarted: "Malite",
    signIn: "Banye",
    createAccount: "Mepee akaụntụ",
    createFarmerAccount: "Mepee akaụntụ onye ọrụ ubi",
    signupSubtitle: "Sonye FarmHack AI ka ịchekwa mkparịta ụka ihe ubi gị.",
    loginSubtitle: "Gaa n'ihu na mkparịta ụka ihe ubi gị.",
    fullName: "Aha zuru oke",
    emailAddress: "Adreesị ozi-e",
    password: "Okwuntughe",
    showPassword: "Gosi okwuntughe",
    hidePassword: "Zoo okwuntughe",
    preferredLanguage: "Asụsụ ị kacha achọ",
    alreadyHaveAccount: "Ị nwere akaụntụ?",
    newToFarmhack: "Ị bụ onye ọhụrụ na FarmHack AI?",
    signInLink: "Banye",
    createAccountLink: "Mepee akaụntụ",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Tinye okwuntughe gị",
    namePlaceholder: "Aha gị",
    createAccountButton: "Mepee akaụntụ",
    signInButton: "Banye",
    pleaseWait: "Biko chere...",
    errorAuthGeneric: "Enweghị ike ịbanye na akaụntụ gị. Biko nwaa ọzọ.",
    errorConnection:
      "Enweghị ike ijikọ. Lelee njikọ ịntanetị gị ma nwaa ọzọ.",
    consentAgree:
      "Ekwenyere m na ọkwa nzuzo na nhazi data.",
    consentReadNotice: "Gụọ ọkwa ahụ",

    // Navigation
    newChat: "Mkparịta ụka ọhụrụ",
    yourConversations: "Mkparịta ụka gị",
    conversationsWillAppear: "Mkparịta ụka gị ga-apụta ebe a.",
    profileSettings: "Profaịlụ na nhazi",
    signOut: "Pụọ",
    newConversationTitle: "Mkparịta ụka ọhụrụ",
    conversationTitle: "Mkparịta ụka",

    // Chat
    yourCropCompanion: "Onye enyemaka ubi gị",
    whatIsHappening: "Gịnị na-eme ihe ubi gị?",
    describeSigns:
      "Kọwaa ihe ị na-ahụ ma ọ bụ tinye foto doro anya. Anyị ga-enyere gị aka ịmata ihe ị ga-elele.",
    placeholderMessage: "Kọwaa ihe ị na-ahụ na ihe ubi gị...",
    messageLabel: "Ozi",
    attachPhoto: "Tinye foto ihe ubi",
    sendMessage: "Zipu",
    conversationLanguage: "Asụsụ mkparịta ụka",
    analyzing: "Na-enyocha ihe ubi gị...",
    cropAssessment: "Nyocha ihe ubi",
    deleteConversation: "Hichapụ mkparịta ụka",
    deleteConfirm: "Hichapụ mkparịta ụka a?",
    retry: "Nwaa nyocha ọzọ",
    errorAssessmentFailed:
      "Enweghị ike inyocha ihe ubi ahụ. Biko nwaa ọzọ.",
    assessmentQueued:
      "Ọrụ nyocha nọ na-arụ ọrụ. Echekwara ozi gị, a ga-anwa ọzọ; ị nwekwara ike ịnwa ugbu a.",
    errorInvalidImage: "Ụdị foto ezighi ezi. Jiri JPEG, PNG, ma ọ bụ WebP.",
    errorImageTooLarge: "Foto ahụ buru ibu. Oke 10MB.",
    errorMaxImages: "Eruola foto 5 n'otu mkparịta ụka.",
    errorLoadConversation: "Enweghị ike ibudata mkparịta ụka. Nwaa ọzọ.",
    errorDeleteConversation: "Enweghị ike ihichapụ mkparịta ụka.",
    imageNotExamined:
      "Enweghị ike inyocha otu foto ma ọ bụ karịa. Biko bulite foto doro anya ọzọ.",

    // Assessment fields
    observedSigns: "Ihe ị na-ahụ",
    possibleCauses: "Ihe ndị nwere ike ịkpata ya",
    thingsToCheck: "Ihe ị ga-elele",
    suggestedActions: "Omume a tụrụ aro",
    whenToSeekHelp: "Mgbe ị ga-achọ enyemaka",
    uncertainty: "Enweghị ntụkwasị obi",

    // Follow-up
    feedbackTitle: "Ntuziaka a nyere aka?",
    feedbackQuestion: "Ntuziaka a nyere aka na ihe ubi gị?",
    observationLabel: "Gịnị ka i hụrụ mgbe i nwara ntuziaka ahụ?",
    observationPlaceholder: "Kọwaa ihe ị hụrụ...",
    outcomeHelped: "O nyere aka",
    outcomeNotHelped: "O nyereghị aka",
    outcomeUnsure: "Amaghị m",
    submitFeedback: "Zipu echiche",
    submitting: "Na-ezipu…",
    thankYouFeedback: "Daalụ maka echiche gị.",

    // Profile
    profileSettingsTitle: "Profaịlụ na nhazi",
    manageHowYouUse: "Jikwaa otú i si eji FarmHack AI.",
    back: "Laghachi",
    languageTitle: "Asụsụ",
    languageChoice: "Họrọ asụsụ ị kacha achọ maka mkparịta ụka ihe ubi.",
    languageSaved: "Emelitere asụsụ.",
    languageSaveError: "Enweghị ike ichekwa asụsụ.",
    savedToAccount:
      "A na-echekwa nhọrọ gị na akaụntụ gị ma jiri ya na mkparịta ụka.",
    passwordSection: "Okwuntughe",
    passwordHint: "Jiri okwuntughe siri ike nke ị naghị eji ebe ọzọ.",
    changePasswordButton: "Gbanwee okwuntughe",
    currentPassword: "Okwuntughe ugbu a",
    newPasswordPlaceholder: "Okwuntughe ọhụrụ",
    passwordChanged: "Agbanweela okwuntughe.",
    passwordChangeError: "Enweghị ike ịgbanwe okwuntughe.",

    // Photo tips
    photoTips: "Ndụmọdụ foto",
    tipWholePlant: "Osisi niile — gụnyere alaka na akwụkwọ",
    tipAffectedPart: "Akụkụ metụtara — foto dị nso",
    tipGoodLighting: "Ìhè dị mma — ìhè eke, ọ bụghị flash",
    limitationsNotice:
      "Nke a bụ nduzi AI mbido, ọ bụghị nchọpụta ọrịa doro anya. Kwenye mkpebi ndị dị mkpa na onye ọrụ ugbo mpaghara.",

    // Sources
    sourcesTitle: "Isi mmalite maka ntuziaka a",
    sourceBackedLabel: "Site n'isi mmalite (ọ bụghị ọkachamara nyochara ya)",
    sourceExpertReviewed: "Ọkachamara nyochara ya",
    sourceAccessed: "Enyochara ya",

    // Guided symptom intake
    guidedTitle: "Ihe ịrịba ama ndị a na-ahụkarị — pịa iji tinye",
    guidedHint: "Ọ dịghị gị mma ihe ị ga-ede? Malite site n'ịhọrọ ihe ị na-ahụ.",
    symptomYellowLeaves: "Akwụkwọ na-acha odo odo",
    symptomDarkSpots: "Ntụpọ ojii na akwụkwọ",
    symptomWilting: "Ịkpọnwu ma ọ bụ ịda",
    symptomHoles: "Oghere n'ime akwụkwọ",
    symptomInsects: "Ụmụ ahụhụ ma ọ bụ ijiji ọcha",
    symptomLeafCurl: "Akwụkwọ gbagọrọ agbagọ",
    symptomFruitRot: "Ọrịa mkpụrụ ma ọ bụ ntụpọ",

    // Follow-up reminders
    reminderTitle: "Ntuziaka ahụ nyere ihe ubi gị aka?",
    reminderBody:
      "Ị jụrụ maka nsogbu ihe ubi ụbọchị ole na ole gara aga. Ịkọ ihe mere ga-enyere gị aka inweta ntuziaka ka mma ma nyere ndị ọrụ ubi ndị ọzọ aka.",
    reminderAction: "Kekọọ mmelite",
    reminderDismiss: "Ọ bụghị ugbu a",

    // Errors
    errorSendFailed: "Enweghị ike izipu ozi gị. Biko nwaa ọzọ.",
    errorFeedbackFailed: "Enweghị ike izipu echiche gị. Biko nwaa ọzọ.",
  },
};

/**
 * Get translated text for a given key and language.
 * Falls back to English if the key or language is not found.
 */
export function t(key: string, language: Language): string {
  const strings = translations[language] ?? translations.English;
  return strings[key] ?? translations.English[key] ?? key;
}
