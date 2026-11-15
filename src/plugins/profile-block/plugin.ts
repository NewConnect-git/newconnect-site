import { definePlugin } from "emdash";

/**
 * One person per block: illustration, name and a short introduction.
 * Insert one block per person; consecutive blocks stack as a list.
 * (A repeater can't hold a media picker, so each person is a block.)
 */
export function createPlugin() {
	return definePlugin({
		id: "profile-block",
		version: "0.1.0",
		admin: {
			portableTextBlocks: [
				{
					type: "profile",
					label: "プロフィール",
					description: "イラストと名前、自己紹介を横に並べる",
					category: "Sections",
					fields: [
						{
							type: "media_picker",
							action_id: "image",
							label: "イラスト",
							mime_type_filter: "image/",
						},
						{ type: "text_input", action_id: "name", label: "名前" },
						{ type: "text_input", action_id: "bio", label: "自己紹介", multiline: true },
					],
				},
			],
		},
	});
}

export default createPlugin;
