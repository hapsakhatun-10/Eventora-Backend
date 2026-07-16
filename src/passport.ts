import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "./config";
import { userCollection } from "./db";

export function configurePassport(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email from Google"), undefined);
          }

          let user = await userCollection.findOne({ email });

          if (user) {
            if (!user.provider) {
              await userCollection.updateOne(
                { _id: user._id },
                { $set: { provider: "google", avatar: profile.photos?.[0]?.value } }
              );
            }
          } else {
            const result = await userCollection.insertOne({
              name: profile.displayName,
              email,
              avatar: profile.photos?.[0]?.value,
              provider: "google",
              createdAt: new Date().toISOString(),
            });
            user = await userCollection.findOne({ _id: result.insertedId });
          }

          if (!user) {
            return done(new Error("User not found after upsert"), undefined);
          }

          return done(null, {
            userId: user._id!.toString(),
            name: user.name,
            email: user.email,
          } as any);
        } catch (err) {
          return done(err as Error, undefined);
        }
      }
    )
  );
}
