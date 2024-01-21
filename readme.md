# Windows OCR

This is a fun project I did on my spare time. It was made to fulfill the need of a reliable OCR in the Windows operating system. I know there's a built-in OCR pre-installed with Windows, but it sucks (at the time of this writing). Hence, with the knowledge that Google has a far superior text recognition software and an excessive amount of time I had during the summer break, this app was born.

## Foreword

- This app was made with Google Vision API integrated, meaning that you'll have to make a Google Cloud project to use this app. Do note that a legit credit/debit card is required, although you won't be charged anything as long as you meet the criteria (see the guide below). A guide on setting up a Google Cloud project is available [here](#setting-up).

- This app was made with the Windows OS in mind –specifically Windows 10 and later–, thus the app was primarily coded for them. I've tried to code in the friendliest way possible in case someone wants to build this app for another OS. However, do keep in mind that things may break and some codes may require adjusting.

## Technologies

- Electron.js
- Tailwind CSS
- Cloud Vision API

## App controls

- This is a tray app. It can be controlled from the tray.

- Press `Ctrl+Shift+Alt+T` to launch the OCR.

- Default shortcut and some other options can be set in the app's settings page.
  > Please be wise on choosing a key combination. An overlapping key combination will overwrite any behavior that's registered in the OS (e.g `Ctrl+C` will disable copy, and will launch the OCR instead)

- The capture box can be moved <br><br>
<img src="https://lh3.googleusercontent.com/u/4/drive-viewer/AEYmBYQzGQ0xX2ytssDuYwjkTxDY9ENmhj6UKsTQvCygplVF6ZHW3RISvah_R9-LJAgBIfGdgY7gfdtLcxvblCpMvDCmN9zAWQ=w1920-h868" width="400">

- The `Enter` key can be pressed to perform OCR after the capture box has been drawn. The `Esc` key can be pressed to cancel/close the OCR window.

## Setting up

As mentioned above, this app uses Google Vision API. Don't worry, **unless you're performing more than 1000 OCRs per month, you won't be charged anything**. If you're still not sure, you can [check this article](https://cloud.google.com/vision/pricing#prices) under the "Document Text Detection" row to review Google's latest policy for Vision API's usage and pricing. Please bear with me with this scuffed guide.

1. **Make a new Google Cloud project** \
   [Click here](https://console.cloud.google.com/projectcreate) to go to the project creation page. Project name can be anything, but do keep it meaningful to keep yourself out of trouble in the future. You can leave the organisation empty.

2. **Change your project to your newly made project** \
   <img src="https://lh3.googleusercontent.com/u/4/drive-viewer/AEYmBYSzXMK0n4ewduNp_PeoV5OzRpjJFFlrWhoIzxL-KElqKXbpoCngTspCxQeepwUtJZC8qTeoz-LKTFhIAiOUJyu2ICloBQ=w1920-h868" width="140"> \
   If the newly created project is not auto-selected after you've finished the project creation steps, press the `Select a project` button at the top left of the screen and switch to the newly created project.
   
3. **Try Google Cloud for free** \
   <img src="https://lh3.googleusercontent.com/u/4/drive-viewer/AEYmBYSor7nPc6AqL8E-w-W2Rwc8uOrmmqNYPgIXjtsoHCsat01atc4wt7bRzbmsiDKDumgvYb88BzKrIe-o5c7qVOCFekeg9g=w1920-h868" width="450"> \
   Skip to the next step if you've joined the trial before and it has expired. Press the `Start Free` button on the big banner that pops up at the top of the screen, or [click here](https://console.cloud.google.com/freetrial/signup/tos) if it doesn't appear.
   
4. **Fill up all the fields** \
   As mentioned before, a legit credit/debit card is required. Google may charge your card $1 or the lowest possible amount depending on your currency which will immediately be refunded. This is just to ensure that your credit/debit card is valid.

5. **Create a service account** \
   Next is to create a service account. Go to `Navigation Menu > IAM & Admin > Service Account`, or [click here](https://console.cloud.google.com/iam-admin/serviceaccounts/create) to open the service account creation page. Give it a meaningful name and a description, then press `Next`. Give it the `Editor` role. The third step is optional. When you're happy with the account settings, press `Done`.
   
6. **Create a JSON key** \
    You will then be redirected to the service account list page. The newly created service account should be there in the table. Press the three dots at the rightmost column, then press `Manage keys`. Press `Add key > Create new > JSON`. A JSON file will be downloaded afterwards. This file will be used for the API's authentication while using the Windows OCR app.

7. **Activate the Cloud Vision API** \
   <img src="https://lh3.googleusercontent.com/u/4/drive-viewer/AEYmBYQCH90abr4a71FxOrWfIYDYTsGz53-tSHYyIGq6SMkIspd9Wvhi3OLbjk99dplndYLDxxyoRMfN7zU2apFK6uUq7Go0tQ=w1920-h868" width="450"> \
    Type `cloud vision` on the search bar and press `Cloud Vision API` under the `Marketplace` section, or [click this link](https://console.cloud.google.com/marketplace/product/google/vision.googleapis.com) to open the product page. Press `Enable` and wait for a few seconds. Those who have activated this API before will instead see a `Manage` button. 

8. **Activate Google Cloud** \
    Press the `Google Cloud` logo at the top left of the screen to go back to the dashboard. There should be a new suggestion offering you to fully activate your Google Cloud trial. There may also be a pop up that appears at the top of the screen offering the same. Press `Activate` on either offer to activate your Google Cloud subscription. **This will ensure that your Cloud Vision resource won't be deleted after the trial ends**. 

9. **The JSON key file** \
    Rename the downloaded JSON key file to `credentials.json` and place it in the same directory as the Windows OCR app.

### That's it. Enjoy a sophisticated OCR in Windows!
> Dipundamel kaliyan ❤️ dening Karel Bondan   
> ꧋ꦔꦺꦭ꧀ꦩꦸꦸꦲꦶꦏꦸꦏꦼꦭꦏꦺꦴꦤ꧀ꦤꦺꦏꦤ꧀ꦛꦶꦭꦏꦸ꧉